
import PhoneInput from "react-phone-input-2";

export interface PhoneFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function PhoneField({ label, value, onChange, error }: PhoneFieldProps) {
  return (
    <label className="block w-full space-y-3">
      {label ? <span className="block text-sm font-medium text-ink">{label}</span> : null}
      <PhoneInput
        country="ng"
        onlyCountries={["ng", "gb"]}
        preferredCountries={["ng", "gb"]}
        value={value}
        onChange={onChange}
        enableSearch={false}
        inputClass="ridespot-phone-input"
        containerClass="ridespot-phone-input"
        buttonClass="ridespot-phone-input"
        dropdownClass="ridespot-phone-input"
        placeholder="e.g 000 1234 8292 29"
      />
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </label>
  );
}
