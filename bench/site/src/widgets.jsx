// Each kind of form control, wired to the store. The widget code is the real library's; only the wiring is ours.
import React, { useState } from "react";
import Select from "react-select";
import AsyncSelect from "react-select/async";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import MuiSelect from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions, Field as HField, Label as HLabel } from "@headlessui/react";
import { useCombobox } from "downshift";
import { useKept, useForm } from "./store";

export function Row({ id, label, required, error, children, labelFor = true }) {
  return (
    <div className={`row${error ? " bad" : ""}`}>
      {label && (labelFor ? <label htmlFor={id}>{label}{required && <span className="req"> *</span>}</label>
        : <div className="lbl" id={`${id}-label`}>{label}{required && <span className="req"> *</span>}</div>)}
      {children}
      {error && <div className="err" role="alert" id={`${id}-err`}>{error}</div>}
    </div>
  );
}

const errOf = (errs, k) => (errs.includes(k) ? "This field is required." : null);

// ---- native controls ----
export function Text({ k, label, required, type = "text", textarea, maxLength, aria }) {
  const { fields, set, redraw, meta } = useForm();
  const Tag = textarea ? "textarea" : "input";
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <Tag id={k} name={k} type={textarea ? undefined : type} value={fields[k] ?? ""} maxLength={maxLength}
        aria-label={aria} aria-required={required || undefined} aria-invalid={meta.errors.includes(k) || undefined}
        onChange={(e) => set(k, e.target.value, false)} onBlur={redraw} />
    </Row>
  );
}

export function NativeSelect({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <select id={k} name={k} value={fields[k] ?? ""} required={required} onChange={(e) => set(k, e.target.value)}>
        <option value="">Select...</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Row>
  );
}

export function Radios({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <fieldset className={`row${meta.errors.includes(k) ? " bad" : ""}`} id={k}>
      <legend>{label}{required && <span className="req"> *</span>}</legend>
      {options.map((o) => (
        <label key={o} className="inline">
          <input type="radio" id={`${k}-${o}`} name={k} value={o} checked={fields[k] === o} onChange={() => set(k, o)} /> {o}
        </label>
      ))}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </fieldset>
  );
}

export function Check({ k, label, required }) {
  const { fields, set, meta } = useForm();
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <label className="inline">
        <input type="checkbox" id={k} name={k} checked={!!fields[k]} onChange={(e) => set(k, e.target.checked)} />
        {" "}{label}{required && <span className="req"> *</span>}
      </label>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

// The Oracle Candidate Experience consent box: the real checkbox is shrunk to nothing, a styled
// span inside the label toggles it, and the label's text holds a link that opens a dialog instead of ticking the box.
export function HiddenCheck({ k, before, link, required }) {
  const { fields, set, meta } = useForm();
  const [dialog, setDialog] = useKept(`HiddenCheck.dialog.${k}`, false);
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <label className="inline" htmlFor={k}>
        <input type="checkbox" id={k} name={k} checked={!!fields[k]} required={required}
               style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
               onChange={(e) => set(k, e.target.checked)} />
        <span>
          <span style={{ display: "inline-block", width: 16, height: 16, border: "1px solid #555", marginRight: 6,
                         background: fields[k] ? "#2a6" : "#fff", verticalAlign: "middle" }}
                onClick={(e) => { e.preventDefault(); set(k, !fields[k]); }} />
          <span>{before}<a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDialog(true); }}>{link}</a>
            {required && <span className="req"> *</span>}</span>
        </span>
      </label>
      {dialog && <div role="dialog" aria-label={link}>{link} text <button onClick={() => setDialog(false)}>Close</button></div>}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

export function File({ k, label, required }) {
  const { fields, set, meta } = useForm();
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <input type="file" id={k} name={k} accept=".pdf,.doc,.docx" onChange={(e) => set(k, e.target.files[0]?.name || "")} />
      {fields[k] && <div className="hint">Attached: {fields[k]}</div>}
    </Row>
  );
}

// Several one-character boxes for one answer (date of birth, verification codes). Typing moves to the next box.
export function Split({ k, label, required, parts }) {
  const { fields, set, redraw, meta } = useForm();
  const v = fields[k] || {};
  return (
    <fieldset className={`row${meta.errors.includes(k) ? " bad" : ""}`} id={k}>
      <legend>{label}{required && <span className="req"> *</span>}</legend>
      {parts.map(([name, len, ph], i) => (
        <input key={name} id={`${k}-${name}`} className="split" aria-label={`${label}: ${name}`} placeholder={ph}
          maxLength={len} size={len + 1} inputMode="numeric" value={v[name] || ""} onBlur={redraw}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "").slice(0, len);
            set(k, (o) => ({ ...(o || {}), [name]: val }), false);
            if (val.length === len && i + 1 < parts.length) document.getElementById(`${k}-${parts[i + 1][0]}`)?.focus();
          }} />
      ))}
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </fieldset>
  );
}

// ---- library widgets ----
const opt = (x) => ({ value: x, label: x });

export function RSelect({ k, label, required, options, multi }) {
  const { fields, set, meta } = useForm();
  const cur = fields[k];
  const value = multi ? (cur || []).map(opt) : cur ? opt(cur) : null;
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <Select inputId={k} instanceId={k} options={options.map(opt)} value={value} isMulti={multi}
        aria-invalid={meta.errors.includes(k)} classNamePrefix="rs"
        onChange={(o) => set(k, multi ? (o || []).map((x) => x.value) : o?.value ?? "")} />
    </Row>
  );
}

// Options come from a "server" after a delay, filtered by what's typed (type-to-search).
// short: once picked, the box shows only the option's value ("Chennai"), not its list text ("Chennai, Tamil Nadu"),
// as Oracle's city box does: the shown text is then the same as what was typed
export function RAsync({ k, label, required, search, minChars = 0, placeholder, short = false }) {
  const { fields, set, meta } = useForm();
  const cur = fields[k];
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <AsyncSelect inputId={k} instanceId={k} cacheOptions={false} defaultOptions={minChars === 0}
        loadOptions={search} placeholder={placeholder} classNamePrefix="rs"
        formatOptionLabel={(o, { context }) => (short && context === "value" ? o.value : o.label)}
        noOptionsMessage={({ inputValue }) => (inputValue.length < minChars ? `Type at least ${minChars} characters` : "No results were found.")}
        value={cur ? { value: cur.value ?? cur, label: cur.label ?? cur } : null}
        onChange={(o) => set(k, o ? { value: o.value, label: o.label } : "")} />
    </Row>
  );
}

export function MuiAuto({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <div className="row">
      <Autocomplete id={k} options={options} value={fields[k] || null} autoHighlight={false}
        onChange={(_, v) => set(k, v || "")}
        renderInput={(p) => <TextField {...p} label={label} required={required} size="small"
          error={meta.errors.includes(k)} helperText={errOf(meta.errors, k)} />} />
    </div>
  );
}

export function MuiSel({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  return (
    <div className="row">
      <FormControl fullWidth size="small" required={required} error={meta.errors.includes(k)}>
        <InputLabel id={`${k}-label`}>{label}</InputLabel>
        <MuiSelect labelId={`${k}-label`} id={k} value={fields[k] || ""} label={label} onChange={(e) => set(k, e.target.value)}>
          {options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </MuiSelect>
      </FormControl>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

export function Headless({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const [q, setQ] = useKept(`Headless.q.${k}`, "");
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <HField className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <HLabel>{label}{required && <span className="req"> *</span>}</HLabel>
      <Combobox value={fields[k] || null} onChange={(v) => set(k, v || "")} onClose={() => setQ("")}>
        <ComboboxInput name={k} className="hl-input" displayValue={(v) => v || ""} onChange={(e) => setQ(e.target.value)} />
        <ComboboxOptions anchor="bottom start" className="hl-options">
          {shown.map((o) => <ComboboxOption key={o} value={o} className="hl-option">{o}</ComboboxOption>)}
        </ComboboxOptions>
      </Combobox>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </HField>
  );
}

export function Down({ k, label, required, options }) {
  const { fields, set, meta } = useForm();
  const [items, setItems] = useKept(`Down.items.${k}`, options);
  const cb = useCombobox({
    items, inputId: k, selectedItem: fields[k] || null,
    onInputValueChange: ({ inputValue }) => setItems(options.filter((o) => o.toLowerCase().includes((inputValue || "").toLowerCase()))),
    onSelectedItemChange: ({ selectedItem }) => set(k, selectedItem || ""),
  });
  return (
    <div className={`row${meta.errors.includes(k) ? " bad" : ""}`}>
      <label {...cb.getLabelProps()}>{label}{required && <span className="req"> *</span>}</label>
      <div className="ds">
        <input {...cb.getInputProps()} />
        <button type="button" aria-label="toggle menu" {...cb.getToggleButtonProps()}>▾</button>
      </div>
      <ul {...cb.getMenuProps()} className="ds-menu">
        {cb.isOpen && items.map((it, i) => (
          <li key={it} className={cb.highlightedIndex === i ? "hi" : ""} {...cb.getItemProps({ item: it, index: i })}>{it}</li>
        ))}
      </ul>
      {errOf(meta.errors, k) && <div className="err" role="alert">{errOf(meta.errors, k)}</div>}
    </div>
  );
}

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d, month) => (d ? (month ? `${pad(d.getMonth() + 1)}/${d.getFullYear()}`
  : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`) : "");
const parse = (s, month) => {
  if (!s) return null;
  const p = s.split("/").map(Number);
  return month ? new Date(p[1], p[0] - 1, 1) : new Date(p[2], p[1] - 1, p[0]);
};

export function DateP({ k, label, required, month }) {
  const { fields, set, meta } = useForm();
  return (
    <Row id={k} label={label} required={required} error={errOf(meta.errors, k)}>
      <DatePicker id={k} selected={parse(fields[k], month)} onChange={(d) => set(k, fmt(d, month))}
        dateFormat={month ? "MM/yyyy" : "dd/MM/yyyy"} showMonthYearPicker={month} placeholderText={month ? "MM/YYYY" : "DD/MM/YYYY"} />
    </Row>
  );
}
