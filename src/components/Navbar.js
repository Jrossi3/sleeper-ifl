import React, { useState } from "react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = ["Home", "About", "Services", "Blog", "Contact"];

  return (
    <nav className="bg-blue-600 text-white p-4 flex justify-between items-center">
      <div className="text-xl font-bold">My Website</div>

      {/* Desktop Menu */}
      <ul className="hidden md:flex space-x-6">
        {tabs.map((tab) => (
          <li key={tab} className="hover:underline cursor-pointer">
            {tab}
          </li>
        ))}
      </ul>

      {/* Hamburger Icon */}
      <button
        className="md:hidden flex flex-col space-y-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="w-6 h-1 bg-white"></span>
        <span className="w-6 h-1 bg-white"></span>
        <span className="w-6 h-1 bg-white"></span>
      </button>

      {/* Mobile Menu */}
      {isOpen && (
        <ul className="absolute top-16 left-0 w-full bg-blue-700 flex flex-col space-y-4 p-4 md:hidden">
          {tabs.map((tab) => (
            <li key={tab} className="hover:underline cursor-pointer">
              {tab}
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
