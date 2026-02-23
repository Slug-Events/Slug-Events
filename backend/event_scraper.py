"""Utilities for scraping upcoming events from an external source."""

from __future__ import annotations

import json
import re
import html as html_lib
import os
from datetime import datetime, timezone
from typing import Any

import requests
from bs4 import BeautifulSoup
from dateutil import parser

SOURCE_URL = os.getenv("SCRAPER_SOURCE_URL", "").strip()
REQUEST_TIMEOUT_SECONDS = 20
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; SlugEventsBot/1.0)"
}


class ScraperError(Exception):
    """Raised when the events scraper cannot fetch or parse data."""


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split()).strip()
    return cleaned or None

def _clean_description(value: str | None) -> str | None:
    """Decode and normalize event descriptions."""
    cleaned = _clean_text(value)
    if not cleaned:
        return None

    decoded = html_lib.unescape(cleaned)
    decoded = html_lib.unescape(decoded)
    decoded = decoded.replace("\\n", " ")
    decoded = BeautifulSoup(decoded, "html.parser").get_text(" ", strip=True)
    decoded = _clean_text(decoded)
    if not decoded:
        return None

    decoded = re.sub(r"\s*[\[\(]\s*(?:\.{3}|…)\s*[\]\)]\s*$", "", decoded)
    decoded = re.sub(
        r"\s+\b(?:in|at|on|for|with|to)\s*[\[\(]\s*(?:\.{3}|…)\s*[\]\)]\s*$",
        "",
        decoded,
        flags=re.IGNORECASE,
    )
    decoded = re.sub(r"\s+\b(?:in|at|on|for|with|to)\s*$", "", decoded, flags=re.IGNORECASE)
    decoded = re.sub(r"\s+", " ", decoded).strip()
    return decoded or None


def _parse_datetime(value: str | None) -> str | None:
    """Parse a date/time string to ISO-8601 format when possible."""
    cleaned = _clean_text(value)
    if not cleaned:
        return None

    try:
        parsed = parser.parse(cleaned, fuzzy=True)
    except (ValueError, TypeError, OverflowError):
        return None

    return parsed.isoformat()


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _event_from_json_ld(payload: dict[str, Any]) -> dict[str, Any] | None:
    event_types = set(_as_list(payload.get("@type")))
    if "Event" not in event_types:
        return None

    image = payload.get("image")
    if isinstance(image, list):
        image = image[0] if image else None

    location_name = None
    location_address = None
    location_latitude = None
    location_longitude = None
    location_payload = payload.get("location")
    if isinstance(location_payload, dict):
        location_name = _clean_text(location_payload.get("name"))
        address = location_payload.get("address")
        if isinstance(address, dict):
            location_address = _clean_text(
                ", ".join(
                    part
                    for part in [
                        address.get("streetAddress"),
                        address.get("addressLocality"),
                        address.get("addressRegion"),
                        address.get("postalCode"),
                    ]
                    if part
                )
            )
        else:
            location_address = _clean_text(address)

        geo = location_payload.get("geo")
        if isinstance(geo, dict):
            latitude = geo.get("latitude")
            longitude = geo.get("longitude")
            try:
                location_latitude = float(latitude) if latitude is not None else None
                location_longitude = float(longitude) if longitude is not None else None
            except (TypeError, ValueError):
                location_latitude = None
                location_longitude = None

    event = {
        "title": _clean_text(payload.get("name")),
        "url": _clean_text(payload.get("url")),
        "description": _clean_description(payload.get("description")),
        "startTime": _parse_datetime(payload.get("startDate")),
        "endTime": _parse_datetime(payload.get("endDate")),
        "location": {
            "name": location_name,
            "address": location_address,
            "latitude": location_latitude,
            "longitude": location_longitude,
        },
        "image": _clean_text(image),
    }

    if not event["title"]:
        return None
    return event


def _flatten_json_ld(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        flattened: list[dict[str, Any]] = []
        for item in payload:
            flattened.extend(_flatten_json_ld(item))
        return flattened

    if not isinstance(payload, dict):
        return []

    flattened = [payload]
    graph = payload.get("@graph")
    if isinstance(graph, list):
        for item in graph:
            flattened.extend(_flatten_json_ld(item))

    item_list = payload.get("itemListElement")
    if isinstance(item_list, list):
        for item in item_list:
            if isinstance(item, dict) and "item" in item:
                flattened.extend(_flatten_json_ld(item["item"]))
            else:
                flattened.extend(_flatten_json_ld(item))
    return flattened


def _extract_events_from_json_ld(soup: BeautifulSoup) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for script_tag in soup.select('script[type="application/ld+json"]'):
        raw_payload = script_tag.string or script_tag.text
        if not raw_payload:
            continue

        try:
            parsed_payload = json.loads(raw_payload)
        except json.JSONDecodeError:
            continue

        for candidate in _flatten_json_ld(parsed_payload):
            event = _event_from_json_ld(candidate)
            if event:
                events.append(event)
    return events

def _extract_event_from_card(card) -> dict[str, Any] | None:  # pylint: disable=too-many-locals
    title_link = card.select_one(
        "a.tribe-events-calendar-list__event-title-link, h2 a, h3 a, h4 a, a"
    )
    title = _clean_text(title_link.get_text(strip=True) if title_link else None)
    if not title:
        return None

    url = _clean_text(title_link.get("href") if title_link else None)

    datetime_nodes = card.select(
        "time, .tribe-event-date-start, .tribe-event-date-end, "
        ".tribe-events-pro-photo__event-datetime"
    )
    datetimes = [
        _clean_text(node.get("datetime") or node.get_text(" ", strip=True))
        for node in datetime_nodes
    ]
    datetimes = [value for value in datetimes if value]
    start_time = _parse_datetime(datetimes[0]) if datetimes else None
    end_time = _parse_datetime(datetimes[1]) if len(datetimes) > 1 else None

    location_text = None
    location_latitude = None
    location_longitude = None
    location_node = card.select_one(
        ".tribe-events-calendar-list__event-venue-title, "
        ".tribe-events-pro-photo__event-venue, "
        ".tribe-events-calendar-list__event-venue"
    )
    if location_node:
        location_text = _clean_text(location_node.get_text(" ", strip=True))
        latitude = location_node.get("data-lat")
        longitude = location_node.get("data-lng")
        try:
            location_latitude = float(latitude) if latitude else None
            location_longitude = float(longitude) if longitude else None
        except (TypeError, ValueError):
            location_latitude = None
            location_longitude = None

    description_node = card.select_one(
        ".tribe-events-calendar-list__event-description, "
        ".tribe-events-pro-photo__event-description, p"
    )
    description = _clean_text(
        description_node.get_text(" ", strip=True) if description_node else None
    )
    description = _clean_description(description)

    image_node = card.select_one("img")
    image = _clean_text(
        image_node.get("src") or image_node.get("data-src") if image_node else None
    )

    return {
        "title": title,
        "url": url,
        "description": description,
        "startTime": start_time,
        "endTime": end_time,
        "location": {
            "name": location_text,
            "address": None,
            "latitude": location_latitude,
            "longitude": location_longitude,
        },
        "image": image,
    }


def _extract_events_from_html_cards(soup: BeautifulSoup) -> list[dict[str, Any]]:
    card_selectors = [
        ".tribe-events-pro-photo__event",
        ".tribe-events-calendar-list__event-row",
        "article.tribe-events-calendar-list__event",
        ".tribe-common-g-row.tribe-events-calendar-list__event-row",
    ]

    cards = []
    for selector in card_selectors:
        cards.extend(soup.select(selector))

    if not cards:
        return []

    events: list[dict[str, Any]] = []
    for card in cards:
        parsed_event = _extract_event_from_card(card)
        if parsed_event:
            events.append(parsed_event)

    return events


def _dedupe_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen_keys = set()
    unique_events: list[dict[str, Any]] = []

    for event in events:
        dedupe_key = (
            event.get("title"),
            event.get("startTime"),
            event.get("url"),
        )
        if dedupe_key in seen_keys:
            continue
        seen_keys.add(dedupe_key)
        unique_events.append(event)

    return unique_events


def parse_events_from_html(html: str) -> list[dict[str, Any]]:
    """Extract events from HTML content."""
    soup = BeautifulSoup(html, "html.parser")

    json_ld_events = _extract_events_from_json_ld(soup)
    html_events = _extract_events_from_html_cards(soup)

    events = _dedupe_events(json_ld_events + html_events)
    return events


def scrape_upcoming_events(source_url: str = SOURCE_URL) -> dict[str, Any]:
    """Fetch upcoming events page and return parsed JSON payload."""
    if not source_url:
        raise ScraperError("Scraper source URL is not configured")
    try:
        response = requests.get(
            source_url,
            headers=DEFAULT_HEADERS,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise ScraperError(f"Failed to fetch source page: {exc}") from exc

    events = parse_events_from_html(response.text)
    if not events:
        raise ScraperError("No events found on source page")

    return {
        "source": source_url,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(events),
        "events": events,
    }
