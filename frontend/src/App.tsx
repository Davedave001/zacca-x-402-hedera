import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Catalog } from "./components/Catalog";
import { TryItLive } from "./components/TryItLive";
import { VbrInput } from "./components/VbrInput";
import { OnChainEvidence } from "./components/OnChainEvidence";
import { Footer } from "./components/Footer";

function App() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Catalog />
      <TryItLive />
      <VbrInput />
      <OnChainEvidence />
      <Footer />
    </>
  );
}

export default App;
