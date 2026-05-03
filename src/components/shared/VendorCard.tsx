import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, MapPin, Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import vendorPhotographer from "@/assets/vendor-photographer.jpg";
import vendorFlorist from "@/assets/vendor-florist.jpg";
import vendorCatering from "@/assets/vendor-catering.jpg";
import vendorDj from "@/assets/vendor-dj.jpg";
import vendorVenue from "@/assets/vendor-venue.jpg";
import vendorMakeup from "@/assets/vendor-makeup.jpg";

const imageMap: Record<string, string> = {
  "vendor-photographer": vendorPhotographer,
  "vendor-florist": vendorFlorist,
  "vendor-catering": vendorCatering,
  "vendor-dj": vendorDj,
  "vendor-venue": vendorVenue,
  "vendor-makeup": vendorMakeup,
};

interface VendorCardProps {
  vendor: {
    id: string;
    name: string;
    category: string;
    description: string;
    rating: number;
    reviews: number;
    startingPrice: number;
    distance: string;
    availability: string;
    image: string;
    location?: string;
  };
}

export function VendorCard({ vendor }: VendorCardProps) {
  const [saved, setSaved] = useState(false);

  return (
    <Link to={`/vendors/${vendor.id}`} className="group block">
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm mb-4 bg-muted">
          <img
            src={imageMap[vendor.image]}
            alt={vendor.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/55 via-transparent to-transparent" />

          <button
            aria-label={saved ? "Remove from saved" : "Save vendor"}
            onClick={(e) => {
              e.preventDefault();
              setSaved((s) => !s);
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-background/85 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                saved ? "fill-accent text-accent" : "text-foreground"
              }`}
            />
          </button>

          {vendor.availability !== "available" && (
            <Badge className="absolute top-3 left-3 bg-background/85 text-foreground backdrop-blur-sm border-none">
              Limited availability
            </Badge>
          )}

          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-background">
            <p className="font-label tracking-[0.25em]">{vendor.category}</p>
            <div className="flex items-center gap-1 text-xs">
              <Star className="w-3 h-3 fill-accent text-accent" />
              <span className="tnum font-medium">{vendor.rating}</span>
              <span className="text-background/70 tnum">({vendor.reviews})</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <h3 className="font-display text-lg leading-tight transition-colors group-hover:text-accent">
            {vendor.name}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">
            {vendor.description}
          </p>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />
              {vendor.location ?? vendor.distance}
            </p>
            <p className="text-sm tnum font-medium">
              From ${vendor.startingPrice.toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
