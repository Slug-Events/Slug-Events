'use client';

import { useState, useRef } from 'react';
import { useSession, signOut } from "next-auth/react";
import { 
  GoogleMap, 
  LoadScript, 
  Marker,
  Autocomplete 
} from '@react-google-maps/api';

const libraries = ['places'];

export default function Map() {
  const { data: session } = useSession();
  const [markers, setMarkers] = useState([]);
  const autocompleteRef = useRef(null);

  return (
    <div className="h-screen flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex-shrink-0">
              <span className="text-xl font-bold text-blue-600">Slug Events</span>
            </div>
            <div className="flex items-center gap-4">
              {session?.user?.email && (
                <span className="text-gray-600">
                  {session.user.email}
                </span>
              )}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Map Content */}
      <div className="flex-1">
        <LoadScript
          googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          libraries={libraries}
        >
          <div className="relative w-full h-full">
            <div className="absolute top-4 left-4 z-10 w-96">
              <Autocomplete
                onLoad={(autocomplete) => {
                  autocompleteRef.current = autocomplete;
                }}
                onPlaceChanged={() => {
                  if (autocompleteRef.current) {
                    const place = autocompleteRef.current.getPlace();
                    if (place && place.geometry && place.geometry.location) {
                      const location = {
                        lat: place.geometry.location.lat(),
                        lng: place.geometry.location.lng()
                      };
                      setMarkers([...markers, location]);
                    }
                  }
                }}
              >
                <input
                  type="text"
                  placeholder="Search for a location"
                  className="w-full px-4 py-2 rounded-lg border shadow-sm"
                />
              </Autocomplete>
            </div>

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
                <Marker
                  key={index}
                  position={{ lat: marker.lat, lng: marker.lng }}
                />
              ))}
            </GoogleMap>
          </div>
        </LoadScript>
      </div>
    </div>
  );
}

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const center = {
  lat: 36.9741,
  lng: -122.0308  // UCSC coordinates
};
