import { cn } from "@/lib/utils";

interface SportIconProps {
    className?: string;
    size?: number;
}

export function FootballIcon({ className, size = 20 }: SportIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("shrink-0", className)}
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
            <path d="M2 12h20" />
            <path d="M12 2a10 10 0 0 1 4 7.5A10 10 0 0 1 12 17a10 10 0 0 1-4-7.5A10 10 0 0 1 12 2" />
        </svg>
    );
}

export function BasketballIcon({ className, size = 20 }: SportIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("shrink-0", className)}
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M4.93 4.93c4.08 2.38 6.2 5.97 7.07 12.07" />
            <path d="M19.07 4.93c-4.08 2.38-6.2 5.97-7.07 12.07" />
            <path d="M2 12h20" />
            <path d="M12 2v20" />
        </svg>
    );
}

export function TennisIcon({ className, size = 20 }: SportIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("shrink-0", className)}
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M18.09 5.91A8.96 8.96 0 0 0 5.91 18.09" />
            <path d="M5.91 5.91a8.96 8.96 0 0 0 12.18 12.18" />
        </svg>
    );
}

export function AllSportsIcon({ className, size = 20 }: SportIconProps) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("shrink-0", className)}
        >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
    );
}

/** Utility component that renders the sport icon by name */
export function SportIcon({
    sport,
    className,
    size = 20,
}: SportIconProps & { sport: string }) {
    const s = sport.toLowerCase();
    if (s.includes("foot") || s.includes("soccer")) return <FootballIcon className={className} size={size} />;
    if (s.includes("basket") || s.includes("nba")) return <BasketballIcon className={className} size={size} />;
    if (s.includes("tennis") || s.includes("atp")) return <TennisIcon className={className} size={size} />;
    return <AllSportsIcon className={className} size={size} />;
}
