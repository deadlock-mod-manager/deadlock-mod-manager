import { Search } from 'lucide-react';
import { SortType } from '@/lib/constants';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { Switch } from './ui/switch';

type SearchBarProps = {
  query: string;
  setQuery: (query: string) => void;
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
  hideOutdated: boolean;
  setHideOutdated: (hideOutdated: boolean) => void;
};

const SearchBar = ({
  query,
  setQuery,
  sortType,
  setSortType,
  hideOutdated,
  setHideOutdated,
}: SearchBarProps) => {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            id="search"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a mod"
            value={query}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Select onValueChange={setSortType} value={sortType}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.values(SortType).map((type) => (
                  <SelectItem className="capitalize" key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex h-10 items-center gap-2">
            <Switch
              checked={hideOutdated}
              id="hide-outdated"
              onCheckedChange={setHideOutdated}
            />
            <Label className="text-sm" htmlFor="hide-outdated">
              Hide outdated
            </Label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
