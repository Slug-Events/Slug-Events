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
  }, [router]);

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
          eventId: response_data.eventId
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
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteEvent = async () => {
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
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/delete_event/${selectedEvent}`,
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
    } catch (error) {
      alert(error.message);
    }
    alert("Pressed ");
    console.log("Selected Event:", selectedEvent);
    return;
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
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm py-4 px-6 flex justify-between items-center">
        <div className="flex items-center space-x-6">
          <h1 className="text-2xl font-bold text-gray-800">
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
          <span className="text-gray-600">Welcome, {user?.name}</span>
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
            onLoad={(map) => (mapRef.current = map)}
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
                <div className="bg-white rounded-lg p-4 min-w-[300px] space-y-3">
                  <h3 className="font-bold text-lg border-b pb-2">
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
                      value={formData.ageLimit}
                      onChange={(e) =>
                        setFormData({ ...formData, ageLimit: e.target.value })
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
                <div className="bg-white rounded-lg shadow-lg p-4 min-w-[300px]">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-800">
                      {selectedEvent.title}
                    </h3>
                    <button
                      onClick={() => setSelectedEvent(null)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {selectedEvent.description}
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Address:
                      </span>
                      <span className="text-xs text-gray-700 flex-1">
                        {selectedEvent.address}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Host:
                      </span>
                      <span className="text-xs text-gray-700 break-all">
                        {selectedEvent.host}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Starts:
                      </span>
                      <span className="text-xs text-gray-700">
                        {new Date(selectedEvent.startTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Ends:
                      </span>
                      <span className="text-xs text-gray-700">
                        {new Date(selectedEvent.endTime).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Capacity:
                      </span>
                      <span className="text-xs text-gray-700">
                        {selectedEvent.capacity || "Unlimited"}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Age Limit:
                      </span>
                      <span className="text-xs text-gray-700">
                        {selectedEvent.ageLimit || "None"}
                      </span>
                    </div>
                    {selectedEvent.registration && (
                      <div className="flex items-center">
                        <span className="text-xs font-medium text-gray-500 w-20">
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
                      <span className="text-xs font-medium text-gray-500 w-20">
                        Category:
                      </span>
                      <span className="text-xs text-gray-700 capitalize">
                        {selectedEvent.category}
                      </span>
                    </div>
                    <button
                    onClick={handleDeleteEvent}
                    className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2"
                    >
                      Delete Event
                    </button>
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