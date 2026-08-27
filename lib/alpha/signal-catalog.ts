export type SignalFamily =
  | 'catalyst' | 'liquidity' | 'microstructure' | 'attention' | 'structure'
  | 'dilution' | 'insider' | 'regime' | 'sympathy' | 'volatility' | 'quality' | 'distribution';

export interface SignalDefinition {
  key: string;
  family: SignalFamily;
  label: string;
  direction: 'positive' | 'negative' | 'contextual';
  horizon: 'minutes' | 'hours' | 'days' | 'structural';
  requiredInputs: string[];
  description: string;
}

export const signalCatalog: SignalDefinition[] = [
  { key: 'fresh_material_filing', family: 'catalyst', label: 'Fresh material filing', direction: 'contextual', horizon: 'hours', requiredInputs: ['SEC filing'], description: 'Recency and materiality of 8-K/6-K or equivalent catalyst filings.' },
  { key: 'catalyst_novelty', family: 'catalyst', label: 'Catalyst novelty', direction: 'positive', horizon: 'days', requiredInputs: ['filings', 'news history'], description: 'Measures whether a catalyst is genuinely new rather than recycled narrative.' },
  { key: 'catalyst_confirmation', family: 'catalyst', label: 'Catalyst confirmation', direction: 'positive', horizon: 'hours', requiredInputs: ['filings', 'market'], description: 'Independent confirmation between regulatory facts and market response.' },
  { key: 'rvol_acceleration', family: 'liquidity', label: 'RVOL acceleration', direction: 'positive', horizon: 'minutes', requiredInputs: ['market snapshots'], description: 'Rate of change in relative volume rather than absolute RVOL alone.' },
  { key: 'dollar_volume_capacity', family: 'liquidity', label: 'Dollar-volume capacity', direction: 'positive', horizon: 'minutes', requiredInputs: ['price', 'volume'], description: 'Usable liquidity capacity for realistic participation without dominant impact.' },
  { key: 'spread_compression', family: 'liquidity', label: 'Spread compression', direction: 'positive', horizon: 'minutes', requiredInputs: ['bid', 'ask'], description: 'Improving tradeability as spreads tighten into genuine demand.' },
  { key: 'liquidity_vacuum', family: 'liquidity', label: 'Liquidity vacuum risk', direction: 'negative', horizon: 'minutes', requiredInputs: ['spread', 'volume'], description: 'Detects apparently strong price action unsupported by exit liquidity.' },
  { key: 'float_rotation', family: 'microstructure', label: 'Float rotation', direction: 'contextual', horizon: 'minutes', requiredInputs: ['float', 'volume'], description: 'Turnover of estimated tradable float and its acceleration.' },
  { key: 'price_volume_divergence', family: 'microstructure', label: 'Price-volume divergence', direction: 'negative', horizon: 'minutes', requiredInputs: ['price', 'volume'], description: 'Flags weakening marginal response despite continued volume.' },
  { key: 'failed_breakout_density', family: 'microstructure', label: 'Failed breakout density', direction: 'negative', horizon: 'minutes', requiredInputs: ['intraday price'], description: 'Repeated rejection near highs, a distribution and exhaustion clue.' },
  { key: 'velocity_acceleration', family: 'attention', label: 'Attention velocity acceleration', direction: 'positive', horizon: 'minutes', requiredInputs: ['social mentions'], description: 'Second derivative of permitted cross-platform attention.' },
  { key: 'cross_source_propagation', family: 'attention', label: 'Cross-source propagation', direction: 'positive', horizon: 'hours', requiredInputs: ['social sources'], description: 'Independent spread across authorized communities rather than one-source concentration.' },
  { key: 'attention_saturation', family: 'distribution', label: 'Attention saturation', direction: 'negative', horizon: 'minutes', requiredInputs: ['social', 'price'], description: 'Crowding risk when attention growth no longer creates proportional price response.' },
  { key: 'promotion_concentration', family: 'distribution', label: 'Promotion concentration', direction: 'negative', horizon: 'hours', requiredInputs: ['social provenance'], description: 'Measures dependence on a small set of promotional sources.' },
  { key: 'float_confidence', family: 'structure', label: 'Float confidence', direction: 'positive', horizon: 'structural', requiredInputs: ['share structure'], description: 'Confidence-weighted quality of the current tradable-float estimate.' },
  { key: 'authorized_overhang', family: 'dilution', label: 'Authorized share overhang', direction: 'negative', horizon: 'structural', requiredInputs: ['authorized shares', 'outstanding shares'], description: 'Potential supply capacity relative to current outstanding shares.' },
  { key: 'outstanding_expansion', family: 'dilution', label: 'Outstanding share expansion', direction: 'negative', horizon: 'days', requiredInputs: ['share structure history'], description: 'Observed increase in outstanding shares across verified observations.' },
  { key: 'shelf_atm_risk', family: 'dilution', label: 'Shelf/ATM risk', direction: 'negative', horizon: 'days', requiredInputs: ['SEC filings'], description: 'Potential near-term issuance from shelves, ATMs and prospectus supplements.' },
  { key: 'reverse_split_recency', family: 'structure', label: 'Reverse split recency', direction: 'negative', horizon: 'days', requiredInputs: ['corporate actions'], description: 'Structural risk from recent reverse splits and post-split supply behavior.' },
  { key: 'insider_alignment', family: 'insider', label: 'Insider alignment', direction: 'contextual', horizon: 'days', requiredInputs: ['Forms 3/4/5'], description: 'Direction and significance of recent insider ownership changes.' },
  { key: 'sector_sympathy_strength', family: 'sympathy', label: 'Sector sympathy strength', direction: 'positive', horizon: 'hours', requiredInputs: ['peer market data'], description: 'Measures whether the move is supported by correlated peers or theme leaders.' },
  { key: 'regime_alignment', family: 'regime', label: 'Regime alignment', direction: 'positive', horizon: 'hours', requiredInputs: ['market regime'], description: 'Compatibility between setup type and current speculative market regime.' },
  { key: 'volatility_expansion', family: 'volatility', label: 'Volatility expansion', direction: 'contextual', horizon: 'minutes', requiredInputs: ['price path'], description: 'Measures expansion from baseline while penalizing unstable terminal volatility.' },
  { key: 'gap_halt_risk', family: 'volatility', label: 'Gap/halt risk', direction: 'negative', horizon: 'minutes', requiredInputs: ['price', 'volatility', 'history'], description: 'Probability-weighted discontinuity risk that cannot be managed with ordinary exits.' },
  { key: 'data_freshness', family: 'quality', label: 'Data freshness', direction: 'positive', horizon: 'minutes', requiredInputs: ['provider timestamps'], description: 'Hard quality gate preventing stale observations from masquerading as conviction.' },
  { key: 'source_agreement', family: 'quality', label: 'Source agreement', direction: 'positive', horizon: 'minutes', requiredInputs: ['multiple providers'], description: 'Cross-provider consistency for price, structure and catalyst facts.' },
  { key: 'peak_probability', family: 'distribution', label: 'Peak probability', direction: 'negative', horizon: 'minutes', requiredInputs: ['price', 'volume', 'social', 'structure'], description: 'Composite estimate of exhaustion and distribution probability.' },
];

export const signalFamilies = [...new Set(signalCatalog.map((signal) => signal.family))];
