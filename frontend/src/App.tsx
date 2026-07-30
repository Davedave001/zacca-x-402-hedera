import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Catalog } from "./components/Catalog";
import { TryItLive } from "./components/TryItLive";
import { VbrInput } from "./components/VbrInput";
import { OnChainEvidence } from "./components/OnChainEvidence";
import { Footer } from "./components/Footer";

function App() {
  return (
    <div className="eb-frame">
      <div className="eb-content">
        <Nav />
        <div className="page-inner">
          <Hero />
          <HowItWorks />
          <Catalog />
          <TryItLive />
          <VbrInput />
          <OnChainEvidence />
        </div>
        <Footer />
      </div>
    </div>
  );
}

export default App;
