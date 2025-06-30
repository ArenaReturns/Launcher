import React from "react";

// Simple Slider Component
export const SimpleSlider: React.FC<{
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
}> = ({ value, onChange, max = 100, step = 1 }) => {
  return (
    <>
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
      <div className="relative w-full">
        <input
          type="range"
          min="0"
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
        />
      </div>
    </>
  );
};

// Simple Switch Component
export const SimpleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-white/20"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
};

// Simple Select Component
export const SimpleSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-white/10 border border-white/20 rounded px-3 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          className="bg-slate-800"
        >
          {option.label}
        </option>
      ))}
    </select>
  );
};
