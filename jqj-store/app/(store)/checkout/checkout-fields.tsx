import { CHECKOUT_AUTOCOMPLETE, type CheckoutCustomerField } from "@/lib/checkout-messages";

const controlClass = "input-field text-base md:text-sm";

function controlClassName(invalid: boolean) {
  return invalid ? `${controlClass} !border-red-400` : controlClass;
}

export function CheckoutRequiredMark() {
  return (
    <>
      <span aria-hidden="true"> *</span>
      <span className="sr-only"> Required</span>
    </>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-red-400">
      {error}
    </p>
  );
}

type CheckoutTextFieldProps = {
  id: string;
  name: CheckoutCustomerField;
  label: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
  value: string;
  error?: string;
  onChange: (value: string) => void;
};

export function CheckoutTextField({
  id,
  name,
  label,
  type = "text",
  required = false,
  value,
  error,
  onChange,
}: CheckoutTextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-white">
        {label}
        {required ? <CheckoutRequiredMark /> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={CHECKOUT_AUTOCOMPLETE[name]}
        required={required}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={controlClassName(Boolean(error))}
      />
      <FieldError id={errorId} error={error} />
    </div>
  );
}

type CheckoutCountryFieldProps = {
  id: string;
  value: string;
  error?: string;
  countries: readonly string[];
  onChange: (value: string) => void;
};

export function CheckoutCountryField({
  id,
  value,
  error,
  countries,
  onChange,
}: CheckoutCountryFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm text-white">
        Country
        <CheckoutRequiredMark />
      </label>
      <select
        id={id}
        name="country"
        autoComplete={CHECKOUT_AUTOCOMPLETE.country}
        required
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={controlClassName(Boolean(error))}
      >
        {countries.map((country) => (
          <option key={country} value={country} className="bg-brand-surface">
            {country}
          </option>
        ))}
      </select>
      <FieldError id={errorId} error={error} />
    </div>
  );
}
