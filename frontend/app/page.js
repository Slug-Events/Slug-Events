import Link from "next/link";
import LoginButton from "@/app/components/LoginButton";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#003c6c] to-[#0064b4]">
      {/* Navigation Bar */}
      <header className="absolute top-0 w-full bg-transparent">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            {/* Logo/Title */}
            <div className="flex-shrink-0">
              <Link href="/" className="text-2xl font-bold text-white">
                Slug Events
              </Link>
            </div>
            
            {/* Login Button */}
            <div className="flex items-center">
              <LoginButton />
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            UCSC Event Discovery
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-2xl mx-auto">
            Find and explore events happening around UC Santa Cruz campus
          </p>
        </div>
      </main>
    </div>
  );
}
