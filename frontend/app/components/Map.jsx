'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';
import { GoogleMap, LoadScript, Marker, Autocomplete } from '@react-google-maps/api';

const libraries = ['places'];
const mapContainerStyle = { width: '100%', height: '100%' };
const center = { lat: 36.9741, lng: -122.0308 };

export default function Map() {
  const router = useRouter();
  const [markers, setMarkers] = useState([]);
  const [user, setUser] = useState(null);
  const [mapCenter, setMapCenter] = useState(center);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    category: 'general',
    address: ''
  });
  const autocompleteRef = useRef(null);

  useEffect(() => {
    const handleToken = () => {
      const queryParams = new URLSearchParams(window.location.search);
      const token = queryParams.get('token');
      
      if (token) {
        localStorage.setItem('token', token);
        window.history.replaceState({}, '', window.location.pathname);
      }
      
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const decoded = jwtDecode(storedToken);
          setUser(decoded.user);
        } catch (error) {
          console.error('Invalid token:', error);
          localStorage.removeItem('token');
          router.push('/');
        }
      } else {
        router.push('/');
      }
    };

    handleToken();
  }, [router]);

  const handleCreateEvent = async () => {
    if (!selectedLocation) {
      alert('Please select a location on the map');
      return;
    }

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/create_event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          ...formData,
          location: {
            latitude: selectedLocation.lat,
            longitude: selectedLocation.lng
          }
        })
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Server response error: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create event');
      }

      setMarkers(prev => [...prev, selectedLocation]);
      setShowCreateForm(false);
      alert('Event created successfully!');
    } catch (error) {
      console.error('Error creating event:', error);
      alert(error.message);
    }
  };

  const handleMapClick = (e) => {
    setSelectedLocation({
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    });
  };

  const handlePlaceSelect = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place?.geometry?.location) {
        const newLocation = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };
        setSelectedLocation(newLocation);
        setFormData(prev => ({
          ...prev,
          address: place.formatted_address || ''
        }));
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <nav className="bg-blue-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <span className="text-xl font-bold text-white">Slug Events</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
              >
                Create Event
              </button>
              {user && (
                <span className="text-white">
                  Welcome, {user.name || user.email}
                </span>
              )}
              <button
                onClick={async () => {
                  await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/logout`, {
                    credentials: 'include',
                  });
                  localStorage.removeItem('token');
                  router.push('/');
                }}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showCreateForm && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-20 bg-white p-6 rounded-lg shadow-lg w-96 border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-800">Create New Event</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Event Title"
              className="w-full p-2 border rounded text-gray-800 placeholder-gray-500"
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
            />
            <textarea
              placeholder="Description"
              className="w-full p-2 border rounded text-gray-800 placeholder-gray-500"
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
            <Autocomplete
              onLoad={autocomplete => (autocompleteRef.current = autocomplete)}
              onPlaceChanged={handlePlaceSelect}
            >
              <input
                type="text"
                placeholder="Event Address"
                className="w-full p-2 border rounded text-gray-800 placeholder-gray-500"
                value={formData.address}
                onChange={e => setFormData({ ...formData, address: e.target.value })}
              />
            </Autocomplete>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="datetime-local"
                className="p-2 border rounded text-gray-800"
                value={formData.startTime}
                onChange={e => setFormData({ ...formData, startTime: e.target.value })}
              />
              <input
                type="datetime-local"
                className="p-2 border rounded text-gray-800"
                value={formData.endTime}
                onChange={e => setFormData({ ...formData, endTime: e.target.value })}
              />
            </div>
            <select
              className="w-full p-2 border rounded text-gray-800"
              value={formData.category}
              onChange={e => setFormData({ ...formData, category: e.target.value })}
            >
              <option value="general">General</option>
              <option value="social">Social</option>
              <option value="academic">Academic</option>
              <option value="sports">Sports</option>
            </select>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleCreateEvent}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        <LoadScript
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={libraries}
        >
          <div className="absolute top-4 right-4 z-10 w-96">
            <Autocomplete
              onLoad={(autocomplete) => {
                autocompleteRef.current = autocomplete;
              }}
              onPlaceChanged={handlePlaceSelect}
            >
              <input
                type="text"
                placeholder="Search for a location"
                className="w-full px-4 py-2 rounded-lg border shadow-sm text-gray-800 placeholder-gray-500"
              />
            </Autocomplete>
          </div>
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={13}
            onClick={handleMapClick}
          >
            {markers.map((marker, index) => (
              <Marker
                key={index}
                position={{ lat: marker.lat, lng: marker.lng }}
              />
            ))}
            {selectedLocation && (
              <Marker
                position={selectedLocation}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 8,
                  fillColor: "#4285F4",
                  fillOpacity: 1,
                  strokeWeight: 2
                }}
              />
            )}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
}