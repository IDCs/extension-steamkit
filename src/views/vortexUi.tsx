// Vortex's ui/components as plain markup. Extensions can't import those components, and Vortex's
// stylesheet only has the classes its own source uses, so the class strings here are copied verbatim.
import { mdiCheck, mdiMagnify, mdiMenuLeft, mdiMenuRight, mdiUnfoldMoreHorizontal } from "@mdi/js";
import * as React from "react";

export function MdiIcon({ path, className }: { path: string; className: string }) {
  return (
    <svg className={className} role="presentation" viewBox="0 0 24 24">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

/** How a button looks, as Vortex's Button brand and appearance classes. */
export const ButtonStyle = {
  Neutral: "nxm-button-neutral nxm-button-moderate",
  Primary: "nxm-button-primary nxm-button-strong",
  Quiet: "nxm-button-neutral nxm-button-weak",
} as const;
export type ButtonStyle = (typeof ButtonStyle)[keyof typeof ButtonStyle];

interface IButtonProps {
  buttonStyle: ButtonStyle;
  small?: boolean;
  iconPath?: string;
  /** Shows the icon after the label. */
  iconAfter?: boolean;
  title?: string;
  type?: "button" | "submit";
  expanded?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}

export function Button(props: IButtonProps) {
  const { buttonStyle, small, iconPath, iconAfter, title, type, expanded, disabled, onClick, children } =
    props;
  const className = [
    "nxm-button",
    buttonStyle,
    children === undefined ? "nxm-button-icon-only" : undefined,
    small ? "nxm-button-sm" : undefined,
    disabled ? "nxm-button-disabled" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" ");
  const icon =
    iconPath !== undefined ? <MdiIcon className="shrink-0 nxm-button-icon" path={iconPath} /> : null;
  return (
    <button
      aria-expanded={expanded}
      className={className}
      disabled={disabled}
      title={title}
      type={type ?? "button"}
      onClick={onClick}
    >
      {!iconAfter && icon}
      {children !== undefined && <span>{children}</span>}
      {iconAfter && icon}
    </button>
  );
}

interface INoResultsProps {
  iconPath: string;
  title: string;
  message: string;
  children?: React.ReactNode;
}

export function NoResults({ iconPath, title, message, children }: INoResultsProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-y-4 py-16">
      <div className="flex flex-col items-center gap-y-2">
        <MdiIcon className="shrink-0 size-8 text-neutral-subdued" path={iconPath} />
        <div className="text-body-md text-neutral-subdued space-y-2 text-center">
          <p className="font-semibold">{title}</p>
          <p>{message}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ISearchFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}

export function SearchField({ label, value, onChange, onSearch }: ISearchFieldProps) {
  // Vortex styles the hovered input through data-hover, which its form library sets.
  const [hovered, setHovered] = React.useState(false);
  return (
    <form
      className="flex items-start gap-x-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch();
      }}
    >
      <div className="nxm-field max-w-60">
        <label className="nxm-field-label sr-only" htmlFor="steamkit-search">
          {label}
        </label>
        <div className="nxm-field-control">
          <input
            className="nxm-input"
            data-hover={hovered ? "" : undefined}
            id="steamkit-search"
            placeholder={label}
            type="text"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          />
        </div>
      </div>
      <Button buttonStyle={ButtonStyle.Neutral} iconPath={mdiMagnify} title={label} type="submit" />
    </form>
  );
}

export interface IPickerOption<T> {
  label: string;
  value: T;
}

interface IPickerProps<T> {
  options: Array<IPickerOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

/** A dropdown of options; it closes on a choice, a click outside or Escape. */
export function Picker<T>({ options, value, onChange }: IPickerProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [hovered, setHovered] = React.useState<T>(value);
  const root = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) {
      return undefined;
    }
    const closeOutside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = () => {
    setHovered(value);
    setOpen(!open);
  };

  return (
    <div className="nxm-dropdown" ref={root} style={{ position: "relative" }}>
      <Button
        buttonStyle={ButtonStyle.Neutral}
        expanded={open}
        iconAfter={true}
        iconPath={mdiUnfoldMoreHorizontal}
        small={true}
        onClick={toggle}
      >
        {options.find((option) => option.value === value)?.label}
      </Button>
      {open && (
        <div
          className="nxm-dropdown-items"
          role="listbox"
          style={{ position: "absolute", right: 0, top: "calc(100% + 4px)" }}
        >
          {options.map((option) => (
            <div
              aria-selected={option.value === value}
              className={
                option.value === hovered ? "nxm-dropdown-item nxm-dropdown-item-focus" : "nxm-dropdown-item"
              }
              key={option.label}
              role="option"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              onMouseMove={() => setHovered(option.value)}
            >
              <span className="nxm-dropdown-item-label">{option.label}</span>
              {option.value === value && (
                <MdiIcon className="shrink-0 nxm-dropdown-item-icon" path={mdiCheck} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The page numbers a pagination bar shows, as Vortex's does; null marks a gap. */
export function pageNumbers(currentPage: number, totalPages: number): Array<number | null> {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 3) {
    return [1, 2, 3, 4, null, totalPages];
  }
  if (currentPage >= totalPages - 2) {
    return [1, null, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, null, currentPage - 1, currentPage, currentPage + 1, null, totalPages];
}

interface IPaginationProps {
  currentPage: number;
  totalPages: number;
  onPage: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPage }: IPaginationProps) {
  if (totalPages < 2) {
    return null;
  }
  return (
    <nav aria-label="Pagination navigation" className="nxm-pagination" role="navigation">
      <div className="nxm-pagination-items">
        <button
          aria-label="Go to previous page"
          className="nxm-pagination-arrow"
          disabled={currentPage === 1}
          title="Previous page"
          type="button"
          onClick={() => onPage(currentPage - 1)}
        >
          <MdiIcon className="shrink-0" path={mdiMenuLeft} />
        </button>
        {pageNumbers(currentPage, totalPages).map((page, index) =>
          page === null ? (
            <span className="nxm-pagination-separator" key={`gap-${index}`}>
              ...
            </span>
          ) : (
            <button
              aria-current={page === currentPage ? "true" : "false"}
              aria-label={`Go to page ${page}`}
              className={
                page === currentPage
                  ? "nxm-pagination-number nxm-pagination-number-active"
                  : "nxm-pagination-number"
              }
              key={page}
              type="button"
              onClick={() => onPage(page)}
            >
              {page}
            </button>
          ),
        )}
        <button
          aria-label="Go to next page"
          className="nxm-pagination-arrow"
          disabled={currentPage === totalPages}
          title="Next page"
          type="button"
          onClick={() => onPage(currentPage + 1)}
        >
          <MdiIcon className="shrink-0" path={mdiMenuRight} />
        </button>
      </div>
    </nav>
  );
}
