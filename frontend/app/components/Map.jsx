"use client";

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
const bounds = {north: 37.1, south: 36.8, east: -121.82, west: -122.16};

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

export default function Map() {
  const router = useRouter();
  const [markers, setMarkers] = useState([]);
  const [user, setUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    startTime: "",
    endTime: "",
    category: "general",
    address: "",
    capacity: 100,
    ageLimit: 0
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
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/state`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

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
            category: event.category,
            address: event.address,
            capacity: event.capacity,
            ageLimit: event.age_limit,
            host: event.ownerEmail,
            eventId: event.eventId,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };


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
        category: "general",
        address: "",
      });
      alert("Event created successfully!");
      fetchEvents();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) {
      alert("Please select a location on the map");
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

  const handleSignOut = () => {
    localStorage.removeItem("token");
    router.push("/");
  };

  const handleMapClick = async (e) => {
    if (!showCreateForm) return;

    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    updateFormLocation(lat, lng);
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
                onClick={() => setSelectedEvent(marker)}
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
                <div className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white'} rounded-lg p-4 min-w-[300px] space-y-3`}>
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
                      value={formData.ageLimit}
                      onChange={(e) =>
                        setFormData({ ...formData, ageLimit: e.target.value })
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
                  <button
                    onClick={handleCreateEvent}
                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2"
                  >
                    Create Event
                  </button>
                </div>
              </InfoWindow>
            )}

            {selectedEvent && (
              <InfoWindow
                position={{ lat: selectedEvent.lat, lng: selectedEvent.lng }}
                onCloseClick={() => setSelectedEvent(null)}
              >
                <div className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white'} rounded-lg shadow-lg p-4 min-w-[300px]`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                      {selectedEvent.title}
                    </h3>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className={`${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      ✕
                    </button>
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
                        {selectedEvent.ageLimit || "None"}
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
                    {user?.email === selectedEvent?.host && (
                      <button
                      onClick={() => {handleDeleteEvent(); setSelectedEvent(null);}}
                      className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2"
                      >
                        Delete Event
                      </button>
                    )}  
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
}