import React, { useState, useEffect, useRef } from 'react';
import './dropdown.css';

function Dropdown({ options, onSelect, placeholder, value, resetTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState(value ? value : placeholder);
  const dropdownRef = useRef(null);

  const toggleDropdown = () => setIsOpen((prev) => !prev);

  const handleOptionClick = (option, e) => {
    e.stopPropagation();
    setInternalSelected(option);
    onSelect(option);
    setIsOpen(false);
  };

  // 🔁 Reset selection whenever resetTrigger changes
  useEffect(() => {
    setInternalSelected(null);
  }, [resetTrigger]);

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
        <span>{internalSelected ? internalSelected.label : placeholder}</span>
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}></span>
      </div>

      {isOpen && (
        <div className="dropdown-menu" onClick={(e) => e.stopPropagation()}>
          {options.map((option) => (
            <div
              key={option.id || option.label}
              className={`dropdown-item ${
                internalSelected?.id === option.id ? 'selected' : ''
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
