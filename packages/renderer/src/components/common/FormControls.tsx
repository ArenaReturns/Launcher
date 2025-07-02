import React from "react";
import { Slider } from "@/components/ui/slider";

// Simple Slider Component
export const SimpleSlider: React.FC<{
  value: number;
  onChange: (value: number) => void;
  max?: number;
  step?: number;
}> = ({ value, onChange, max = 100, step = 1 }) => {
  return (
    <Slider
      value={[value]}
      onValueChange={(values) => onChange(values[0])}
      max={max}
      step={step}
      className="w-full"
    />
  );
};

import { Switch } from "@/components/ui/switch";

// Simple Switch Component
export const SimpleSwitch: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, onChange }) => {
  return <Switch checked={checked} onCheckedChange={onChange} />;
};

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Simple Select Component
export const SimpleSelect: React.FC<{
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}> = ({ value, onChange, options }) => {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
