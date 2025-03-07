"use client";

import RsvpPanel from './RsvpPanel';
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { jwtDecode } from "jwt-decode";
import {
  GoogleMap,
  LoadScript,
  Marker,
  InfoWindow,
  Autocomplete,
} from "@react-google-maps/api";

const libraries = ["places"];
const mapContainerStyle = { width: "100%", height: "100%" };
const center = { lat: 36.9741, lng: -122.0308 };
const bounds = {north: 37.19, south: 36.78, east: -121.63, west: -122.46};

const lightModeMap = [];
const darkModeMap = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#263c3f" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6b9a76" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#38414e" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#212a37" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#9ca5b3" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#746855" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#1f2835" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#f3d19c" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#2f3948" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#d59563" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#17263c" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#515c6d" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#17263c" }],
  },
];

const generateShareableLink = (eventId) => {
  const baseUrl = window.location.origin;
  return `${baseUrl}/event/${eventId}`;
};

export default function Map() {
  const [rsvps, setRsvps] = useState({});
  const [showRsvpList, setShowRsvpList] = useState(false);
  const router = useRouter();
  const [markers, setMarkers] = useState([]);
  const [user, setUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    category: "",
    address: "",
    capacity: "",
    age_limit: "",
    image: ""
  });
  const autocompleteRef = useRef(null);
  const geocoder = useRef(null);
  const mapRef = useRef(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      setIsDarkMode(savedTheme === "dark");
      document.body.classList.toggle("dark", savedTheme === "dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setIsDarkMode(prefersDark);
      document.body.classList.toggle("dark", prefersDark);
      localStorage.setItem("theme", prefersDark ? "dark" : "light");
    }
  }, []);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setOptions({
        styles: isDarkMode ? darkModeMap : lightModeMap
      });
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    const newTheme = !isDarkMode ? "dark" : "light";
    setIsDarkMode(!isDarkMode);
    localStorage.setItem("theme", newTheme);
    document.body.classList.toggle("dark", !isDarkMode);
  };

  const handleRemoveFromCalendar = async (eventId) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/remove_from_calendar/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove from calendar');
      }
  
      alert('Event removed from your Google Calendar!');
      
      // Update local state to reflect the change immediately
      if (selectedEvent) {
        const safeEmail = user?.email?.replace('@', '_at_').replace('.', '_dot_');
        
        // Create a new calendar_events object without the user's entry
        const updatedCalendarEvents = {...selectedEvent.calendar_events};
        delete updatedCalendarEvents[safeEmail];
        
        // Update the selected event with new calendar_events
        setSelectedEvent({
          ...selectedEvent,
          calendar_events: updatedCalendarEvents
        });
        
        // Also update the event in the markers array
        setMarkers(markers.map(marker => 
          marker.eventId === eventId 
            ? {...marker, calendar_events: updatedCalendarEvents}
            : marker
        ));
      }
      
      // Optionally, still fetch events to ensure backend and frontend are in sync
      fetchEvents();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleAddToCalendar = async (eventId) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/add_to_calendar/${eventId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) {
        throw new Error('Failed to add to calendar');
      }
  
      const data = await response.json();
      const calendarEventId = data.calendarEventId;
      
      alert('Event added to your Google Calendar!');
      
      if (selectedEvent) {
        const safeEmail = user?.email?.replace('@', '_at_').replace('.', '_dot_');
        
        // Create a new calendar_events object with the user's new entry
        const updatedCalendarEvents = {
          ...selectedEvent.calendar_events,
          [safeEmail]: calendarEventId
        };
        
        // Update the selected event with new calendar_events
        setSelectedEvent({
          ...selectedEvent,
          calendar_events: updatedCalendarEvents
        });
        
        // Also update the event in the markers array
        setMarkers(markers.map(marker => 
          marker.eventId === eventId 
            ? {...marker, calendar_events: updatedCalendarEvents}
            : marker
        ));
      }
      
      fetchEvents();
    } catch (error) {
      if (error.message.includes('not authorized')) {
        window.location.href = '/login?next=' + window.location.pathname;
      } else {
        alert(error.message);
      }
    }
  };

  useEffect(() => {
    const handleToken = () => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (token) {
        localStorage.setItem("token", token);
        window.history.replaceState({}, "", window.location.pathname);
      }

      const storedToken = localStorage.getItem("token");
      if (!storedToken) router.push("/");

      try {
        setUser(jwtDecode(storedToken).user);
      } catch (error) {
        localStorage.removeItem("token");
        router.push("/");
      }
    };

    handleToken();
    fetchEvents();
  }, [router]);

  const fetchEvents = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/state`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );



      if (!response.ok) throw new Error("Failed to fetch events");

      const data = await response.json();
      if (data.state?.events) {
        setMarkers(
          data.state.events.map((event) => ({
            lat: event.location.latitude,
            lng: event.location.longitude,
            title: event.title,
            description: event.description,
            startTime: event.startTime,
            endTime: event.endTime,
            category : event.category,
            address: event.address,
            capacity: event.capacity,
            age_limit: event.age_limit,
            image: event.image,
            host: event.ownerEmail,
            eventId: event.eventId,
            rsvps: event.rsvps,
            calendar_events: event.calendar_events || {}
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  const handleRsvp = async (eventId) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/rsvp/${eventId}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to RSVP");

      // Update local RSVP state
      setRsvps((prev) => ({
        ...prev,
        [eventId]: [...(prev[eventId] || []), user.email],
      }));
    } catch (error) {
      alert(error.message);
    }
  };

  const handleUnrsvp = async (eventId) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/unrsvp/${eventId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            keepInCalendar: true
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to remove RSVP");

      // Update local RSVP state
      setRsvps((prev) => ({
        ...prev,
        [eventId]: prev[eventId].filter((email) => email !== user.email),
      }));
    } catch (error) {
      alert(error.message);
    }
  };

  // Add this effect to fetch RSVPs when an event is selected
  useEffect(() => {
    const fetchRsvps = async () => {
      if (selectedEvent?.eventId) {
        try {
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/rsvps/${selectedEvent.eventId}`,
            {
              headers: {
                Authorization: `Bearer ${localStorage.getItem("token")}`,
              },
            }
          );

          if (!response.ok) throw new Error("Failed to fetch RSVPs");

          const rsvpList = await response.json();
          setRsvps((prev) => ({
            ...prev,
            [selectedEvent.eventId]: rsvpList,
          }));
        } catch (error) {
          console.error("Error fetching RSVPs:", error);
        }
      }
    };

    fetchRsvps();
  }, [selectedEvent]);

  const handleCreateEvent = async () => {
    if (!selectedLocation) {
      alert("Please select a location on the map");
      return;
    }

    if (!user?.email) {
      alert("User email not found. Please sign in again.");
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/create_event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            ...formData,
            location: {
              latitude: selectedLocation.lat,
              longitude: selectedLocation.lng,
            },
            host: user.email,
          }),
        }
      );

      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Failed to create event"
        );

      const response_data = await response.json();
      setMarkers((prev) => [
        ...prev,
        {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          ...formData,
          host: user.email,
          eventId: response_data.eventId,
        },
      ]);

      setShowCreateForm(false);
      setFormData({
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        category: "",
        address: "",
      });
      alert("Event created successfully!");
      fetchEvents();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleEditEvent = async () => {
    // if (!selectedLocation) {
    //   alert("Please select a location on the map");
    //   return;
    // }

    // if (!user?.email) {
    //   alert("User email not found. Please sign in again.");
    //   return;
    // }
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/update_event`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({
            ...formData,
            location: {
              latitude: selectedLocation.lat,
              longitude: selectedLocation.lng,
            },
            host: user.email,
            eventId: selectedEventId,
          }),
        }
      );

      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Failed to update event"
        );

      const response_data = await response.json();
      setMarkers((prev) => [
        ...prev,
        {
          lat: selectedLocation.lat,
          lng: selectedLocation.lng,
          ...formData,
          host: user.email,
          eventId: response_data.eventId,
        },
      ]);

      setShowEditForm(false);
      setSelectedEventId(null);
      setFormData({
        title: "",
        description: "",
        startTime: "",
        endTime: "",
        category: "",
        address: "",
      });
      alert("Event updated successfully!");
      fetchEvents();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) {
      alert("Please select an event on the map");
      return;
    }

    if (!user?.email) {
      alert("User email not found. Please sign in again.");
      return;
    }

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/delete_event/${selectedEvent.eventId}`,
        {
          method: "DELETE",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Failed to delete event"
        );
      alert("Event deleted");
      fetchEvents();
    } catch (error) {
      alert(error.message);
    }
  }

  const filterEvents = async (option) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/filter_events/${option}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to filter events");

      const data = await response.json();
      if (data.state?.events) {
        setMarkers(
          data.state.events.map((event) => ({
            lat: event.location.latitude,
            lng: event.location.longitude,
            title: event.title,
            description: event.description,
            startTime: event.startTime,
            endTime: event.endTime,
            category: event.category,
            address: event.address,
            capacity: event.capacity,
            age_limit: event.age_limit,
            image: event.image,
            host: event.ownerEmail,
            eventId: event.eventId,
            rsvps: event.rsvps,
          }))
        );
      }
    } catch (error) {
      console.error("Error filtering events:", error);
    }
  }

  const filterTimes = async (time) => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/filter_times/${time}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (!response.ok) throw new Error("Failed to filter events");

      const data = await response.json();
      if (data.state?.events) {
        setMarkers(
          data.state.events.map((event) => ({
            lat: event.location.latitude,
            lng: event.location.longitude,
            title: event.title,
            description: event.description,
            startTime: event.startTime,
            endTime: event.endTime,
            category: event.category,
            address: event.address,
            capacity: event.capacity,
            age_limit: event.age_limit,
            image: event.image,
            host: event.ownerEmail,
            eventId: event.eventId,
            rsvps: event.rsvps,
          }))
        );
      }
    } catch (error) {
      console.error("Error filtering events:", error);
    }
  }

  const handleSignOut = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

const handleMapClick = async (e) => {
  if (!showCreateForm) return;

  let adjustedLat = e.latLng.lat();
  let adjustedLng = e.latLng.lng();
  const buffer = 0.07;

  if (adjustedLat >= bounds.north - buffer) adjustedLat -= buffer;
  else if (adjustedLat <= bounds.south + buffer) adjustedLat += buffer;

  if (adjustedLng >= bounds.east - buffer) adjustedLng -= buffer;
  else if (adjustedLng <= bounds.west + buffer) adjustedLng += buffer;

  updateFormLocation(adjustedLat, adjustedLng);

  if (mapRef.current) {
    mapRef.current.panTo({ lat: adjustedLat, lng: adjustedLng });
  }
};

  const updateFormLocation = (lat, lng) => {
    setSelectedLocation({ lat, lng });

    geocoder.current.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === "OK" && results[0]) {
        setFormData((prev) => ({
          ...prev,
          address: results[0].formatted_address,
        }));
      }
    });
  };

  const handleCreateButtonClick = () => {
    setShowCreateForm(true);
    if (mapRef.current) {
      const center = mapRef.current.getCenter();
      updateFormLocation(center.lat(), center.lng());
    }
  };

  const handleEditButtonClick = () => {
    if (selectedEvent) {
      updateFormLocation(selectedEvent.lat, selectedEvent.lng);
      setShowEditForm(true);
    }
  };

  const handlePlaceSelect = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place?.geometry?.location) {
        updateFormLocation(
          place.geometry.location.lat(),
          place.geometry.location.lng()
        );
      }
    }
  };

  function getLocalDatetime() {
    const now = new Date();
    // Adjust to local timezone by subtracting the offset
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  }

  function encodeImageToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = error => reject(error);
    });
  }
  
  return (
    <div className={`h-screen flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <header className={`${isDarkMode ? 'bg-gray-800 shadow-md' : 'bg-white shadow-sm'} py-4 px-6 flex justify-between items-center`}>
        <div className="flex items-center space-x-6">
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
            <span className="text-blue-600">Slug Events</span>
          </h1>
          <button
            onClick={handleCreateButtonClick}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Event
          </button>
          <select
            className={`w-full p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value === "") {
                fetchEvents()
              }else{
                filterEvents(e.target.value)
              }
            }}
          >
            <option value="">All Categories</option>
            <option value="general">General</option>
            <option value="sports">Sports</option>
            <option value="ucsc-club">UCSC Club</option>
            <option value="social">Social</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="datetime-local"
            className={`p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
            defaultValue={getLocalDatetime()}
            onChange={(e) =>
              filterTimes(e.target.value)
            }
          />
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleDarkMode}
            className={`${isDarkMode ? 'bg-gray-700 text-gray-100' : 'bg-gray-600 text-white'} px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors`}
          >
            {isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
          <span className={`${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Welcome, {user?.name}</span>
          <button
            onClick={handleSignOut}
            className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex-1 relative">
        <LoadScript
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={libraries}
          onLoad={() => (geocoder.current = new window.google.maps.Geocoder())}
        >
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={13}
            onClick={handleMapClick}
            onLoad={(map) => {
              mapRef.current = map;
              if (isDarkMode) {
                map.setOptions({ styles: darkModeMap });
              }
            }}
            options={{
              restriction: {
                latLngBounds: bounds,
                strictBounds: true,
              },
              styles: isDarkMode ? darkModeMap : lightModeMap,
            }}
          >
            {markers.map((marker, index) => (
              <Marker
                key={index}
                position={{ lat: marker.lat, lng: marker.lng }}
                onClick={() => {
                  setSelectedEvent(marker)
                  if (mapRef.current) {
                    const map = mapRef.current;
                    const mapBounds = map.getBounds();
            
                    if (mapBounds) {
                      const buffer = 0.07; // Moves the map slightly inward
                      
                      let newLat = marker.lat;
                      let newLng = marker.lng;
            
                      // Check if the marker is too close to any boundary and adjust
                      if (marker.lat >= bounds.north - buffer) {
                        newLat -= buffer;
                      }
                      if (marker.lat <= bounds.south + buffer) {
                        newLat += buffer;
                      }
                      if (marker.lng >= bounds.east - buffer) {
                        newLng -= buffer;
                      }
                      if (marker.lng <= bounds.west + buffer) {
                        newLng += buffer;
                      }
            
                      // Move the map to the adjusted position
                      map.panTo({ lat: newLat, lng: newLng });
                    }
                  }
                }}
              />
            ))}
            {showCreateForm && selectedLocation && (
              <InfoWindow
                position={selectedLocation}
                onCloseClick={() => {
                  setShowCreateForm(false);
                  setSelectedLocation(null);
                }}
              >
                <div className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white'} rounded-lg min-w-[300px]`}>
                  <h3 className={`font-bold text-lg border-b pb-2 ${isDarkMode ? 'border-gray-700' : ''}`}>
                    Create New Event
                  </h3>
                  <Autocomplete
                    onLoad={(autocomplete) =>
                      (autocompleteRef.current = autocomplete)
                    }
                    onPlaceChanged={handlePlaceSelect}
                  >
                    <input
                      type="text"
                      placeholder="Event Address"
                      className={`w-full p-2 border rounded mb-2 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </Autocomplete>
                  <input
                    type="text"
                    placeholder="Event Name"
                    className={`w-full p-2 border rounded mb-2 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Capacity (optional)"
                      className={`p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                      value={formData.capacity}
                      onChange={(e) =>
                        setFormData({ ...formData, capacity: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      placeholder="Age Limit (optional)"
                      className={`p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                      value={formData.age_limit}
                      onChange={(e) =>
                        setFormData({ ...formData, age_limit: e.target.value })
                      }
                    />
                  </div>
                  <input
                    type="url"
                    placeholder="Registration URL (optional)"
                    className={`w-full p-2 border rounded mb-2 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                    value={formData.registration}
                    onChange={(e) =>
                      setFormData({ ...formData, registration: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      className={`p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData({ ...formData, startTime: e.target.value })
                      }
                    />
                    <input
                      type="datetime-local"
                      className={`p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData({ ...formData, endTime: e.target.value })
                      }
                    />
                  </div>
                  <select
                    className={`w-full p-2 border rounded ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : ''}`}
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                  >
                    <option value="">All Categories</option>
                    <option value="general">General</option>
                    <option value="sports">Sports</option>
                    <option value="ucsc-club">UCSC Club</option>
                    <option value="social">Social</option>
                  </select>
                  <textarea
                    placeholder="Event Description"
                    className={`w-full p-2 border rounded mb-2 ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : ''}`}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />

                  <div className="mb-2">
                    <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-1">
                      Event Banner (Optional)
                    </label>
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      className="w-full p-2 border rounded"
                      onChange={async (e) =>
                        {
                          if(e.target.files[0].size > 286720) {
                            alert("File is too big! Please ensure it is less than 280KB.");
                            e.target.value = "";
                          }
                          else {
                            const image_base64String = await encodeImageToBase64(e.target.files[0]);
                            console.log("Uploaded image in base64: ", image_base64String);
                            setFormData({ ...formData, image: image_base64String });
                          }
                        }
                      }
                    />
                  </div>

                  <button
                    onClick={handleCreateEvent}
                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2"
                  >
                    Create Event
                  </button>
                </div>
              </InfoWindow>
            )}
            
            {showEditForm && (
              <InfoWindow
                position={selectedLocation}
                onCloseClick={() => {
                  setShowEditForm(false);
                }}
              >
                <div className="bg-white rounded-lg min-w-[300px]">
                  <h3 className="font-bold text-lg border-b pb-2">
                    Edit Event
                  </h3>
                  <Autocomplete
                    onLoad={(autocomplete) =>
                      (autocompleteRef.current = autocomplete)
                    }
                    onPlaceChanged={handlePlaceSelect}
                  >
                    <input
                      type="text"
                      placeholder="Event Address"
                      className="w-full p-2 border rounded mb-2"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                    />
                  </Autocomplete>
                  <input
                    type="text"
                    placeholder="Event Name"
                    className="w-full p-2 border rounded mb-2"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Capacity (optional)"
                      className="p-2 border rounded"
                      value={formData.capacity}
                      onChange={(e) =>
                        setFormData({ ...formData, capacity: e.target.value })
                      }
                    />
                    <input
                      type="number"
                      placeholder="Age Limit (optional)"
                      className="p-2 border rounded"
                      value={formData.age_limit}
                      onChange={(e) =>
                        setFormData({ ...formData, age_limit: e.target.value })
                      }
                    />
                  </div>
                  <input
                    type="url"
                    placeholder="Registration URL (optional)"
                    className="w-full p-2 border rounded mb-2"
                    value={formData.registration}
                    onChange={(e) =>
                      setFormData({ ...formData, registration: e.target.value })
                    }
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      className="p-2 border rounded"
                      value={formData.startTime}
                      onChange={(e) =>
                        setFormData({ ...formData, startTime: e.target.value })
                      }
                    />
                    <input
                      type="datetime-local"
                      className="p-2 border rounded"
                      value={formData.endTime}
                      onChange={(e) =>
                        setFormData({ ...formData, endTime: e.target.value })
                      }
                    />
                  </div>
                  <select
                    className="w-full p-2 border rounded"
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                  >
                    <option value="general">General</option>
                    <option value="sports">Sports</option>
                    <option value="ucsc-club">UCSC Club</option>
                    <option value="social">Social</option>
                  </select>
                  <textarea
                    placeholder="Event Description"
                    className="w-full p-2 border rounded mb-2"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />

                  <div className="mb-2">
                    <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-1">
                      Event Banner (Optional)
                    </label>
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      className="w-full p-2 border rounded"
                      onChange={async (e) =>
                        {
                          if(e.target.files[0].size > 286720) {
                            alert("File is too big! Please ensure it is less than 280KB.");
                            e.target.value = "";
                          }
                          else {
                            const image_base64String = await encodeImageToBase64(e.target.files[0]);
                            console.log("Uploaded image in base64: ", image_base64String);
                            setFormData({ ...formData, image: image_base64String });
                          }
                        }
                      }
                    />
                  </div>

                  <button
                    onClick={handleEditEvent}
                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2"
                  >
                    Edit Event
                  </button>
                </div>
              </InfoWindow>
            )}
            {selectedEvent && (
              <InfoWindow
                position={{ lat: selectedEvent.lat, lng: selectedEvent.lng }}
                onCloseClick={() => setSelectedEvent(null)}
              >
                <div className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white'} rounded-lg shadow-lg min-w-[300px]`}>
                  {selectedEvent.image && (
                    <div 
                      className="h-32 bg-cover bg-center mb-2"
                      style={{
                      backgroundImage: `url(${selectedEvent.image})`}}
                    ></div>
                  )}
                  <div className="flex justify-between items-start mb-2">
                    <h3 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {selectedEvent.title}
                    </h3>
                  </div>
                  <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mb-3`}>
                    {selectedEvent.description}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Address:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} flex-1`}>
                        {selectedEvent.address}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Host:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} break-all`}>
                        {selectedEvent.host}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Starts:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {new Date(selectedEvent.startTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Ends:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {new Date(selectedEvent.endTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Capacity:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {selectedEvent.capacity || "Unlimited"}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Age Limit:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        {selectedEvent.age_limit || "None"}
                      </span>
                    </div>
                    {selectedEvent.registration && (
                      <div className="flex items-center">
                        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                          Registration:
                        </span>
                        <a
                          href={selectedEvent.registration}
                          className="text-xs text-blue-600 hover:underline"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Link
                        </a>
                      </div>
                    )}
                    <div className="flex items-center">
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} w-20`}>
                        Category:
                      </span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} capitalize`}>
                        {selectedEvent.category}
                      </span>
                    </div>
                    
                    {/* Calendar Controls Section */}
                    <div className="mt-2 pt-2 border-t">
                      {(() => {
                        // Check if this event is in the user's calendar
                        const safeEmail = user?.email?.replace('@', '_at_').replace('.', '_dot_');
                        const isInCalendar = selectedEvent?.calendar_events && 
                                            selectedEvent?.calendar_events[safeEmail];
                        
                        return (
                          <div className="flex justify-between items-center">
                            {isInCalendar ? (
                              <button
                                onClick={() => handleRemoveFromCalendar(selectedEvent.eventId)}
                                className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition-colors"
                              >
                                Remove from Calendar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAddToCalendar(selectedEvent.eventId)}
                                className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                              >
                                Add to Calendar
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const shareableLink = generateShareableLink(selectedEvent.eventId);
                                navigator.clipboard.writeText(shareableLink);
                                alert("Event link copied to clipboard!");
                              }}
                              className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600 transition-colors"
                            >
                              Share Event
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* RSVP Section */}
                    <div className="mt-4 space-y-2 border-t pt-4">
                      <div className="flex justify-between items-center">
                        <div className="space-x-2">
                          {rsvps[selectedEvent.eventId]?.includes(user?.email) ? (
                            <button
                              onClick={() => handleUnrsvp(selectedEvent.eventId)}
                              className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 transition-colors"
                            >
                              Un-RSVP
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRsvp(selectedEvent.eventId)}
                              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 transition-colors"
                            >
                              RSVP
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              setShowRsvpList(!showRsvpList);
                            }}
                            className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors"
                          >
                            {showRsvpList ? "Hide RSVPs" : "View RSVPs"}
                          </button>
                        </div>
                        <span className="text-sm text-gray-600">
                          {rsvps[selectedEvent.eventId]?.length || 0} attending
                        </span>
                      </div>
                    </div>
                    
                    {/* Event Owner Actions */}
                    {selectedEvent.host === user?.email && (
                      <div className="flex flex-col space-y-2 mt-4 pt-4 border-t">
                        <button
                          onClick={() => {
                            setFormData({
                              title: selectedEvent.title,
                              description: selectedEvent.description,
                              startTime: new Date(selectedEvent.startTime).toISOString().slice(0, 16),
                              endTime: new Date(selectedEvent.endTime).toISOString().slice(0, 16),
                              capacity: selectedEvent.capacity || "None",
                              age_limit: selectedEvent.age_limit || "None",
                              image: selectedEvent.image,
                              registration: selectedEvent.registration,
                              category: selectedEvent.category,
                              address: selectedEvent.address,
                            });
                            handleEditButtonClick();
                            setSelectedEventId(selectedEvent.eventId);
                            setSelectedEvent(null);
                          }}
                          className="bg-green-600 text-white py-2 rounded hover:bg-green-700"
                        >
                          Edit Event
                        </button>
                        <button
                          onClick={() => {handleDeleteEvent(); setSelectedEvent(null);}}
                          className="bg-red-600 text-white py-2 rounded hover:bg-red-700"
                        >
                          Delete Event
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </InfoWindow>
            )}
            <RsvpPanel
              isOpen={showRsvpList}
              onClose={() => setShowRsvpList(false)}
              rsvps={rsvps[selectedEvent?.eventId] || []}
              eventTitle={selectedEvent?.title}
            />
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
}