import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, SlidersHorizontal, Store, LayoutDashboard, CalendarDays, FileText, Mail, CheckSquare, ListTodo, CreditCard, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublicNav } from "@/components/public/PublicNav";
import { Footer } from "@/components/public/Footer";
import { VendorCard } from "@/components/shared/VendorCard";
import { vendors } from "@/data/sampleData";

const categories = ["All", "Photographer", "Florist", "Catering", "DJ", "Venue", "Makeup Artist", "Videographer", "Baker", "Event Planner", "Decorator"];

export default function VendorBrowsePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("popular");

  const filtered = vendors
    .filter((v) => category === "All" || v.category === category)
    .filter((v) => v.name.toLowerCase().includes(search.toLowerCase()) || v.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      <div className="pt-24 pb-16">
        <div className="container mx-auto px-4 md:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-h2 font-display mb-2">Browse Vendors</h1>
            <p className="text-muted-foreground">Discover trusted professionals for your event</p>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-11 rounded-lg bg-secondary border-none"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full sm:w-48 h-11 rounded-lg bg-secondary border-none">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-full sm:w-40 h-11 rounded-lg bg-secondary border-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="rating">Highest Rated</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Category pills */}
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {categories.map((cat) => (
              <Button
                key={cat}
                variant={category === cat ? "default" : "secondary"}
                size="sm"
                className="rounded-full whitespace-nowrap h-8"
                onClick={() => setCategory(cat)}
              >
                {cat}
              </Button>
            ))}
          </div>

          {/* Results */}
          <p className="text-sm text-muted-foreground mb-4">{filtered.length} vendors found</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-24">
              <Store className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-display text-lg mb-2">No vendors found</h3>
              <p className="text-sm text-muted-foreground">Try adjusting your filters or search term</p>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
