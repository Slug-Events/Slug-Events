import React from 'react';

const RsvpPanel = ({
  isOpen,
  onClose,
  rsvps = [],
  eventTitle,
  isDarkMode
}) => {
  return (
    <>
      {/* Panel */}
      <div
        className={`fixed right-0 top-24 bottom-0 w-80 shadow-lg transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'
          } ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className={`p-4 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex justify-between items-center mb-2">
              <h3 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Event RSVPs
              </h3>
              <button
                onClick={onClose}
                className={`bg-transparent ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700 hover:bg-transparent'} transition-colors`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <h4 className={`text-sm font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {eventTitle}
            </h4>
            <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
              {rsvps.length} {rsvps.length === 1 ? 'person' : 'people'} attending
            </p>
          </div>

          {/* RSVP List */}
          <div className="flex-1 overflow-y-auto p-4">
            {rsvps.length > 0 ? (
              <ul className="space-y-2">
                {rsvps.map((email, index) => (
                  <li
                    key={index}
                    className={`text-sm p-3 rounded-lg transition-colors ${isDarkMode
                        ? 'text-gray-300 bg-gray-700 hover:bg-gray-600'
                        : 'text-gray-700 bg-gray-50 hover:bg-gray-100'
                      }`}
                  >
                    {email}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className={`text-sm italic ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No RSVPs yet
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`p-4 border-t ${isDarkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          </div>
        </div>
      </div>
    </>
  );
};

export default RsvpPanel;
