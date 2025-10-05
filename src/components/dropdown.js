import React, { useState } from 'react';
import './dropdown.css';

function Dropdown({ options, onSelect, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  const handleOptionClick = (option, e) => {
    e.stopPropagation(); // ✅ prevent parent click
    setSelectedOption(option);
    onSelect(option);
    setIsOpen(false);
  };

  return (
    <div className="dropdown">
      <div className="dropdown-header" onClick={toggleDropdown}>
        <span>{selectedOption ? selectedOption.label : placeholder}</span>
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}></span>
      </div>

      {isOpen && (
        <div
          className="dropdown-menu"
          onClick={(e) => e.stopPropagation()} // ✅ prevent toggle when clicking inside menu
        >
          {options.map((option) => (
            <div
              key={option.value}
              className={`dropdown-item ${
                selectedOption?.value === option.value ? 'selected' : ''
              }`}
              onClick={(e) => handleOptionClick(option, e)} // ✅ pass event
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
