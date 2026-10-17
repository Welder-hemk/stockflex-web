import Hero from "@/components/Hero";
import TargetAudience from "@/components/TargetAudience";
import ValueProposition from "@/components/ValueProposition";
import CompetitiveAdvantages from "@/components/CompetitiveAdvantages";
import { lazy, Suspense } from "react";

// Lazy load below-the-fold components to reduce initial bundle size
const Capacity = lazy(() => import("@/components/Capacity"));
const Pricing = lazy(() => import("@/components/Pricing"));
const FAQ = lazy(() => import("@/components/FAQ"));
const CTA = lazy(() => import("@/components/CTA"));
const StructuresTeaser = lazy(() => import("@/components/StructuresTeaser"));

const Index = () => {
  return (
    <main className="min-h-screen">
      <Hero />
      <TargetAudience />
      <ValueProposition />
      <CompetitiveAdvantages />
      <Suspense fallback={<div className="h-20 flex items-center justify-center">Loading...</div>}>
        <Capacity />
      </Suspense>
      <Suspense fallback={<div className="h-20 flex items-center justify-center">Loading...</div>}>
        <Pricing />
      </Suspense>
      <Suspense fallback={<div className="h-20" />}>
        <StructuresTeaser />
      </Suspense>
      <Suspense fallback={<div className="h-20 flex items-center justify-center">Loading...</div>}>
        <FAQ />
      </Suspense>
      <Suspense fallback={<div className="h-20 flex items-center justify-center">Loading...</div>}>
        <CTA />
      </Suspense>
    </main>
  );
};

export default Index;
