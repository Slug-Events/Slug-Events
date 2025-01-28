'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {jwtDecode} from 'jwt-decode';
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';

const libraries = ['places'];

export default function Map() {
  const router = useRouter();
  const [markers, setMarkers] = useState([]);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const token = queryParams.get('token') || localStorage.getItem('token');

    if (token) {
      try {
        const decoded = jwtDecode(token);
        setUser(decoded.user);

        localStorage.setItem('token', token);
      } catch (error) {
        console.error('Failed to decode token:', error);
        localStorage.removeItem('token');
        router.push('/');
      }

      if (queryParams.get('token')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } else {
      setUser(null);
      router.push('/');
    }
  }, [router]);

  const handleSignOut = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/logout`, {
        credentials: 'include',
      });
      setUser(null);
      localStorage.removeItem('token');
      sessionStorage.clear();
      router.push('/');
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <span className="text-xl font-bold text-blue-600">Slug Events</span>
            </div>
            <div className="flex items-center gap-4">
              {user && (
                <span className="text-gray-600">
                  Welcome, {user.name || user.email}
                </span>
              )}
              <button
                onClick={handleSignOut}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1">
        <LoadScript
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={libraries}
        >
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={center}
            zoom={13}
            onClick={(e) => {
              setMarkers([...markers, {
                lat: e.latLng.lat(),
                lng: e.latLng.lng()
              }]);
            }}
          >
            {markers.map((marker, index) => (
              <Marker key={index} position={marker} />
            ))}
          </GoogleMap>
        </LoadScript>
      </div>
    </div>
  );
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const center = {
  lat: 36.9741,
  lng: -122.0308, // UCSC coordinates
};
