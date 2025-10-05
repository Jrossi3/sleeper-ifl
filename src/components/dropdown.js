import React, { useState, useEffect, useRef } from 'react';
import './dropdown.css';

function Dropdown({ options, onSelect, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const dropdownRef = useRef(null); // to detect outside clicks

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  const handleOptionClick = (option, e) => {
    e.stopPropagation();
    setSelectedOption(option);
    onSelect(option);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="dropdown" ref={dropdownRef}>
      <div className="dropdown-header" onClick={toggleDropdown}>
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}></span>
      </div>

      {isOpen && (
        <div
          className="dropdown-menu"
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((option) => (
            <div
              key={option.value}
              className={`dropdown-item ${
                selectedOption?.value === option.value ? 'selected' : ''
              }`}
              onClick={(e) => handleOptionClick(option, e)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
