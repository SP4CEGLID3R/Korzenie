"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DATE_INPUT_HINT, formatGenDate, parsePolishDate } from "@/lib/genealogy/dates";

/** Pole daty z podpowiedzią i podglądem, jak aplikacja zrozumiała wpis. */
export function DateInput({
  name,
  label,
  defaultValue = "",
  placeholder = "np. 12.03.1850, ok. 1850",
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);

  // Pole jest „niekontrolowane”, więc reset formularza je czyści – wtedy czyścimy też podgląd.
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onReset = () => setValue(defaultValue);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [defaultValue]);
  const parsed = parsePolishDate(value);
  const preview = value.trim()
    ? parsed.ok
      ? { ok: true, text: `Rozumiem: ${formatGenDate(parsed.date)}` }
      : { ok: false, text: "Nie rozumiem tej daty." }
    : null;

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="text"
        autoComplete="off"
        ref={ref}
        defaultValue={defaultValue}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-hint`}
        className="field-input"
      />
      <p id={`${id}-hint`} className={`mt-1 text-sm ${preview && !preview.ok ? "text-danger" : "text-ink-muted"}`}>
        {preview ? preview.text : DATE_INPUT_HINT}
      </p>
    </div>
  );
}
