import React from 'react';
import './GridDisplay.css'; // Import your CSS file

const GridDisplay = ({ items }) => {
  return (
    <div className="grid-container">
      {items.map((item, index) => (
        <div key={index} className="grid-item">
          {item}
        </div>
      ))}
    </div>
  );
};

export default GridDisplay;