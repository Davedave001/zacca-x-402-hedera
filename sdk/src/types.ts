/** Shapes returned by the Zacca Credit Intelligence API -- see the parent repo's IMPLEMENTATION_PLAN.md §3/§6. */

export interface CatalogProduct {
  id: string;
  description: string;
  params: string[];
  priceHbar: string;
  priceTinybars: string;
  endpoint: string;
}

export interface CatalogResponse {
  service: string;
  provider: string;
  network: string;
  payTo: string;
  products: CatalogProduct[];
}

export interface OracleQuote {
  provider: string;
  pair: string;
  price: number;
  publishTime: number;
  ageSeconds: number;
}

export interface VbrClaim {
  businessName: string;
  yearsInBusiness: number;
  sector: string;
}

export interface VbrAttestation {
  claimHash: string;
  issuedAt: number;
  expiresAt: number;
  attestor: string;
  claim: VbrClaim | null;
}

export interface VbrLookupResponse {
  product: "vbr-lookup";
  businessId: string;
  vbrVerified: boolean;
  attestation: VbrAttestation | null;
  methodology: string;
  generatedAt: string;
}

export interface DcsScoreResponse {
  product: "dcs-score";
  businessId: string;
  dcs: number;
  riskTier: "A" | "B" | "C" | "D" | "E";
  rationale: string[];
  rationaleHash: string;
  oracle: OracleQuote | null;
  onChain: { transactionHash: string } | null;
  methodology: string;
  generatedAt: string;
}

export interface OnChainCreditLine {
  limitStablecoinUnits: string;
  maxTenureMonths: number;
  contractAddress: string;
  stablecoin: string;
}

export interface CreditLimitResponse {
  product: "credit-limit";
  businessId: string;
  dcs: number;
  riskTier: "A" | "B" | "C" | "D" | "E";
  probabilityOfDefault: number;
  recommendedCreditLimitStablecoinUnits: string;
  maxTenureMonths: number;
  onChainCreditLine: OnChainCreditLine | null;
  oracle: OracleQuote | null;
  rationaleHash: string;
  onChain: { transactionHash: string } | null;
  methodology: string;
  generatedAt: string;
}

export interface VbrInputResponse {
  businessId: string;
  businessName: string;
  yearsInBusiness: number;
  sector: string;
  onChain: { transactionHash: string };
  note: string;
}

export interface DeploymentContracts {
  VBRRegistry: string;
  StatementRegistry: string;
  DCSRegistry: string;
  MockStablecoin: string;
  CreditLine: string;
  CreditLineUsdc?: string;
  UsdcToken?: string;
  LendingAdapter?: string;
}

export interface LoanTerms {
  eligible: boolean;
  dcs: number;
  riskTier: string;
  maxLoanToValueBps: number;
  suggestedInterestRateBps: number;
}
