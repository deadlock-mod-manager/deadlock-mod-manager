import { SortType } from '@/lib/constants';
import { Search } from 'lucide-react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface SearchBarProps {
  query: string;
  setQuery: (query: string) => void;
  sortType: SortType;
  setSortType: (sortType: SortType) => void;
}

const SearchBar = ({ query, setQuery, sortType, setSortType }: SearchBarProps) => {
  return (
    <div className="flex items-center gap-2 justify-between">
      <div className="flex flex-col gap-2">
        <Label htmlFor="search" className="text-sm font-bold">
          Search
        </Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="search"
            placeholder="Search for a mod"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-sm font-bold">Sort</Label>
        <Select onValueChange={setSortType} value={sortType}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.values(SortType).map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default SearchBar;
