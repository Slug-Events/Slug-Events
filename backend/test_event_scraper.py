"""Tests for event scraping helpers."""

from event_scraper import parse_events_from_html


def test_parse_events_from_json_ld_payload():
    """Extract events from schema.org Event payloads."""
    html = """
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Event",
                "name": "Test Festival",
                "startDate": "2026-03-01T10:00:00-08:00",
                "endDate": "2026-03-01T16:00:00-08:00",
                "description": "&lt;p&gt;A sample event [&hellip;]&lt;/p&gt;",
                "url": "https://example.com/test-festival",
                "location": {
                  "@type": "Place",
                  "name": "Main Plaza",
                  "geo": {
                    "@type": "GeoCoordinates",
                    "latitude": 36.9741,
                    "longitude": -122.0308
                  },
                  "address": {
                    "streetAddress": "123 Pacific Ave",
                    "addressLocality": "Santa Cruz",
                    "addressRegion": "CA",
                    "postalCode": "95060"
                  }
                },
                "image": ["https://example.com/image.jpg"]
              }
            ]
          }
        </script>
      </head>
      <body></body>
    </html>
    """

    events = parse_events_from_html(html)

    assert len(events) == 1
    assert events[0]["title"] == "Test Festival"
    assert events[0]["url"] == "https://example.com/test-festival"
    assert events[0]["location"]["name"] == "Main Plaza"
    assert events[0]["location"]["latitude"] == 36.9741
    assert events[0]["description"] == "A sample event"


def test_parse_events_from_fallback_html_cards():
    """Extract events from common event card markup when JSON-LD is absent."""
    html = """
    <html>
      <body>
        <article class="tribe-events-calendar-list__event">
          <h3><a href="https://example.com/event-1">Boardwalk Live Music</a></h3>
          <time datetime="2026-06-01T18:00:00-07:00"></time>
          <time datetime="2026-06-01T20:00:00-07:00"></time>
          <div class="tribe-events-calendar-list__event-venue">Santa Cruz Beach Boardwalk</div>
          <div class="tribe-events-calendar-list__event-description">Free live show</div>
          <img src="https://example.com/music.jpg" />
        </article>
      </body>
    </html>
    """

    events = parse_events_from_html(html)

    assert len(events) == 1
    assert events[0]["title"] == "Boardwalk Live Music"
    assert events[0]["location"]["name"] == "Santa Cruz Beach Boardwalk"
    assert events[0]["startTime"] is not None


def test_description_strips_dangling_teaser_suffix():
    """Remove trailing teaser fragments like 'in [...] \\n'."""
    html = """
    <html>
      <head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Event",
            "name": "Warriors Night",
            "startDate": "2026-03-11T19:00:00-08:00",
            "description": "Cheer on your Santa Cruz Warriors ... for at least the first 1,000 fans in [&hellip;] \\n"
          }
        </script>
      </head>
      <body></body>
    </html>
    """

    events = parse_events_from_html(html)

    assert len(events) == 1
    assert events[0]["description"].endswith("1,000 fans")
