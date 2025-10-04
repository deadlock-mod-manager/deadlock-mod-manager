import { Search, X } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";
import { Input } from "./input";

export interface SearchInputProps
  extends Omit<React.ComponentProps<"input">, "type"> {
  onClear?: () => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, onChange, ...props }, ref) => {
    const [internalValue, setInternalValue] = React.useState(value || "");

    React.useEffect(() => {
      setInternalValue(value || "");
    }, [value]);

    const handleClear = () => {
      setInternalValue("");
      if (onClear) {
        onClear();
      } else if (onChange) {
        const syntheticEvent = {
          target: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInternalValue(e.target.value);
      if (onChange) {
        onChange(e);
      }
    };

    return (
      <div className='relative'>
        <Search className='absolute top-2.5 left-2 h-4 w-4 text-muted-foreground' />
        <Input
          className={cn("pr-8 pl-8", className)}
          onChange={handleChange}
          ref={ref}
          type='text'
          value={value !== undefined ? value : internalValue}
          {...props}
        />
        {(value || internalValue) && (
          <button
            aria-label='Clear search'
            className='absolute top-2.5 right-2 h-4 w-4 text-muted-foreground transition-colors hover:text-foreground'
            onClick={handleClear}
            type='button'>
            <X className='h-4 w-4' />
          </button>
        )}
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";

export { SearchInput };
