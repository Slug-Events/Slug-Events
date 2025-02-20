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
const bounds = {north: 37.1, south: 36.8, east: -121.82, west: -122.16};

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
    category: "general",
    address: "",
    capacity: "",
    age_limit: ""
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
            category: event.category,
            address: event.address,
            capacity: event.capacity,
            age_limit: event.age_limit,
            host: event.ownerEmail,
            eventId: event.eventId,
            rsvps: event.rsvps,
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
          },
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
        category: "general",
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
        category: "general",
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
            options={{
              restriction: {
                latLngBounds: bounds,
                strictBounds: true,
              },
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
                <div className="bg-white rounded-lg p-4 min-w-[300px] space-y-3">
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
                <div className="bg-white rounded-lg shadow-lg p-4 min-w-[300px]">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-800">
                      {selectedEvent.title}
                    </h3>
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
                        {selectedEvent.age_limit}
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
                              const rect = e.target.getBoundingClientRect();
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
                    
                    {selectedEvent.host == user?.email && (
                      <div className="flex items-center">
                        <button
                          onClick={() => {
                            setFormData({
                              title: selectedEvent.title,
                              description: selectedEvent.description,
                              startTime: new Date(selectedEvent.startTime).toISOString().slice(0, 16),
                              endTime: new Date(selectedEvent.endTime).toISOString().slice(0, 16),
                              capacity: selectedEvent.capacity,
                              age_limit: selectedEvent.age_limit || "None",
                              registration: selectedEvent.registration,
                              category: selectedEvent.category,
                              address: selectedEvent.address,
                            });
                            handleEditButtonClick();
                            setSelectedEventId(selectedEvent.eventId);
                            setSelectedEvent(null);
                          }}
                          className="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700 mt-2">
                          Edit Event
                        </button>
                      </div>
                    )}
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