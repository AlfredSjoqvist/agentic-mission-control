# Fire Spread Prediction Technology — Deep Technical Research

Comprehensive technical research on how fire spread prediction works, from traditional physics models to cutting-edge AI/ML approaches. Researched March 2026 for FireSight hackathon demo credibility.

---

## 1. TRADITIONAL PHYSICS-BASED MODELS

### 1.1 The Rothermel Model (1972) — The Foundation of Everything

**Origin**: Developed by aeronautical engineer Richard C. Rothermel at the USDA Missoula Fire Sciences Laboratory in 1972. Still the backbone of virtually all US fire prediction systems 50+ years later.

**Core Equation** — Rate of Spread:
```
R = (I_R * xi * (1 + phi_w + phi_s)) / (rho_b * epsilon * Q_ig)
```

Where:
- **R** = rate of spread (ft/min or m/min)
- **I_R** = reaction intensity (heat released per unit area of fire front, BTU/ft²/min)
- **xi** = propagating flux ratio (fraction of reaction intensity that heats adjacent fuel)
- **phi_w** = wind coefficient (dimensionless multiplier for wind effect)
- **phi_s** = slope coefficient (dimensionless multiplier for slope effect)
- **rho_b** = ovendry bulk density of the fuel bed (lb/ft³)
- **epsilon** = effective heating number (fraction of fuel that must be heated to ignition)
- **Q_ig** = heat of pre-ignition (BTU/lb, energy needed to raise fuel to ignition temperature)

**Conceptual Basis**: Fire spreads when the instantaneous heat generated exceeds the heat needed to ignite unburned fuel at the fire front. The equation is an energy balance ratio: power source (numerator) vs. heat sinks (denominator — energy lost to convection, diffusion, moisture evaporation).

**Required Inputs**:
- Fuel bed height (ft)
- Fuel loading (tons/acre or kg/m²) — dead and live fuel loads by size class
- Fuel moisture content (% of oven-dry weight) — for 1-hr, 10-hr, 100-hr, live herbaceous, live woody
- Surface area to volume (SAV) ratio of fuel particles
- Fuel bed packing ratio (ratio of fuel bed bulk density to particle density)
- Heat content of fuel (BTU/lb)
- Mineral content (total and effective)
- Wind speed at midflame height (mi/hr)
- Slope steepness (%)

**Fuel Models**: Originally 13 standard fuel models (Albini 1976), expanded to 53 in 2005 (Scott & Burgan) — 40 new models to augment the original 13. These represent stylized fuel bed configurations covering grass, shrub, timber litter, and slash.

**Validated Accuracy**:
- Average MAPE (mean absolute percentage error): **47%** for automatic fire simulations
- Shrub, grass, grass-shrub fuel types: better performance
- Timber fuel types: highest MAPE (~67%)
- Chaparral fuels: 8 of 12 predicted spread rates fell within a factor of 2 (50%-200%) of observed
- Grasslands/croplands: percent errors of 22-35%
- Karst ecosystems: relative error up to 50%
- Modified versions for subtropical forests: MRE reduced from 37.7% to 20.2%

**Key Limitation**: Assumes steady-state fire spread — does not model fire acceleration, extinction, or coupled fire-atmosphere dynamics.

Sources:
- [Rothermel Model Comprehensive Explanation (Andrews 2018, USFS)](https://www.fs.usda.gov/research/treesearch/55928)
- [Rothermel Model Still Running Like a Champ](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1001&context=jfspdigest)
- [Rothermel 50-Year Milestone (Missoula Fire Lab)](https://firelab.org/news/rothermel-fire-spread-model-50-year-milestone-fire-research)

---

### 1.2 FARSITE (Fire Area Simulator) — Spatial Fire Growth

**What it is**: A 2D deterministic fire growth simulation model developed by Mark Finney (USFS). Computes wildfire growth and behavior over heterogeneous landscapes for extended time periods.

**How it works**:
- Uses **Huygens' wavelet principle** (vector propagation) to expand fire perimeters — models fire front as an expanding ellipse at each point
- Integrates Rothermel surface fire model + crown fire models (Van Wagner) + spotting models (Albini) + point-source fire acceleration (no instantaneous steady-state assumption)
- Fire perimeter is a polygon; vertices carry spread rate and intensity data
- Outputs both vector perimeters (at specified time intervals) and interpolated raster maps of fire behavior

**Key Inputs**:
- Landscape (.LCP) file — raster GIS layers: elevation, slope, aspect, fuel model, canopy cover, canopy height, crown base height, crown bulk density
- Fuel moisture (.FMS) file — initial fuel moistures by size class
- Weather (.WTR) file — hourly or daily temperature, humidity, precipitation, cloud cover
- Wind (.WND) file — wind speed and direction at intervals
- Optional: custom fuel models, conversions

**Critical Advantage over Rothermel alone**: Models temporal variation — weather changes hour by hour, fuel moisture responds to diurnal cycles. This is what makes it suitable for multi-day fire simulations.

**Computational Demands**:
- Math and data intensive; hardware-dependent performance
- Multi-threaded (v4.1x) — scales with multiple processors
- Runtime depends on landscape size, fire duration, resolution, and complexity (crown fires, spotting, post-frontal combustion)
- For large fires like the Soda wildfire, computation times were long enough that pre-screening with MTT (Minimum Travel Time) was necessary before running FARSITE
- A physics-based simulation can take ~70 seconds per case vs. ~0.01 seconds for a trained deep learning model (3 orders of magnitude difference)

**Current Status**: FARSITE has been incorporated into FlamMap and is no longer supported as a standalone application.

Sources:
- [FARSITE Technical Report (Finney, USFS RMRS-RP-4)](https://www.fs.usda.gov/rm/pubs/rmrs_rp004.pdf)
- [FARSITE at Missoula Fire Lab](https://www.firelab.org/project/farsite)
- [FARSITE at FRAMES](https://www.frames.gov/catalog/908)

---

### 1.3 FlamMap — Static Landscape Analysis

**What it is**: A fire behavior mapping and analysis system that calculates potential fire behavior for every pixel on a raster landscape under constant conditions.

**Key Difference from FARSITE**:
- FlamMap assumes **every pixel burns independently** — calculates fire behavior (fireline intensity, flame length, spread rate, crown fire activity) for each cell without modeling how fire moves between cells
- FARSITE models fire **growth over time** through vector propagation
- FlamMap holds weather/wind **constant** — no temporal variation, no diurnal cycles
- FlamMap is faster; FARSITE is more realistic for actual fire events

**What FlamMap adds**:
- **Minimum Travel Time (MTT)** algorithm — finds the fastest path fire can travel across a landscape
- Fire behavior outputs for every cell under given conditions
- FARSITE is now embedded within FlamMap — users choose between temporal (FARSITE) and static (MTT) modes

**Operational Use**: Better for strategic planning (where are the worst-case fire behavior areas?) rather than tactical incident response.

Sources:
- [FlamMap at Missoula Fire Lab](https://www.firelab.org/project/flammap)
- [FlamMap vs FARSITE Comparison (IFTDSS)](https://iftdss.firenet.gov/firenetHelp/help/pageHelp/content/20-models/fbmodelcompare.htm)

---

### 1.4 BEHAVE / BehavePlus — Point-Based Fire Behavior

**What it is**: A computer program that predicts fire behavior at a single point (not spatial). The original BEHAVE was replaced by BehavePlus, maintained by USFS Rocky Mountain Research Station.

**Capabilities**:
- Surface fire spread rate and intensity
- Crown fire behavior (passive, active, conditional)
- Fire size from a point ignition
- Spotting distance from torching trees
- Crown scorch height
- Tree mortality probability
- Probability of ignition
- Safety zone size calculation
- Fire containment modeling

**Key Limitation**: Point-based only — calculates fire behavior for a single homogeneous location. Cannot model spatial fire spread. As conditions change, new model runs must be created manually.

**Use Cases**: Training firefighters, prescribed fire planning, projecting behavior of ongoing fires at specific locations, safety zone calculations.

Sources:
- [BehavePlus at USFS](https://research.fs.usda.gov/firelab/products/dataandtools/behaveplus)
- [BEHAVE at FRAMES](https://www.frames.gov/behave/home)

---

## 2. SEMI-EMPIRICAL MODELS

### 2.1 McArthur Forest Fire Danger Index (FFDI) — Australia

**Origin**: Developed in the 1950s-1960s by CSIRO scientist A.G. McArthur through regression analysis of 800+ experimental burns in eucalypt forests across southeastern Australia.

**How it works**: Empirically derived index that combines:
- **Drought factor** — record of dryness based on rainfall and evaporation (both long-term and short-term drought effects)
- **Air temperature** (°C)
- **Relative humidity** (%)
- **Wind speed** (km/h)

The FFDI quantifies: likelihood of ignition, rate of spread, fire intensity, and difficulty of suppression.

**Danger Rating Scale**:
- 12-25: High
- 25-50: Very High
- 50-75: Severe
- 75-100: Extreme
- 100+: Catastrophic

McArthur calibrated the index using the 1939 Black Friday fires as his benchmark "100" — catastrophic conditions.

**Current Status**: Replaced in 2022 by the Australian Fire Danger Rating System (AFDRS), which incorporates more modern fire behavior science. The McArthur system had known biases, particularly underestimating spread rates in grasslands and overestimating in some forest types.

Sources:
- [McArthur FFDI Wikipedia](https://en.wikipedia.org/wiki/McArthur_Forest_Fire_Danger_Index)
- [CSIRO Mk5 Fire Danger Meter](https://www.csiro.au/en/research/disasters/bushfires/mk5-forest-fire-danger-meter)
- [WikiFire McArthur Index](https://wikifire.wsl.ch/tiki-index27fc.html?page=McArthur+Mark+5+forest+fire+danger+index)

---

### 2.2 Canadian Forest Fire Behavior Prediction (FBP) System

**Part of**: The Canadian Forest Fire Danger Rating System (CFFDRS) — Canada's national system.

**14 Primary Inputs in 5 Categories**:
1. **Fuels** — fuel type classification
2. **Weather** — temperature, RH, wind speed/direction, precipitation
3. **Topography** — slope, aspect
4. **Foliar moisture content** — moisture in live conifer needles
5. **Type and duration of prediction** — point vs. area, time window

**16 Fuel Types in 5 Groups**:
1. Coniferous (C-1 through C-7: spruce, pine, slash)
2. Deciduous (D-1)
3. Mixed wood (M-1 through M-4)
4. Slash (S-1 through S-3)
5. Grass (O-1a, O-1b)

**4 Primary Outputs**:
1. **Rate of Spread (ROS)** — head fire speed, including crowning and spotting effects (m/min)
2. **Total Fuel Consumption (TFC)** — weight of fuel consumed on forest floor and in crowns (kg/m²)
3. **Head Fire Intensity (HFI)** — energy output at fire front (kW/m)
4. **Crown Fraction Burned (CFB)** — fraction of tree crowns consumed

Plus 11 secondary outputs computed from these.

**Distinction from US models**: The Canadian system classifies fuel types empirically (what the forest looks like) rather than by physical fuel bed measurements (loading, SAV ratio, etc.). This makes it faster to apply in the field but less generalizable to novel fuel conditions.

Sources:
- [CWFIS FBP Background](https://cwfis.cfs.nrcan.gc.ca/background/summary/fbp)
- [Natural Resources Canada FBP](https://natural-resources.canada.ca/forest-forestry/wildland-fires/canada-fire-behaviour-prediction-system)
- [NWCG CFFDRS Overview](https://www.nwcg.gov/publications/pms437/cffdrs/cffdrs-system-overview)

---

### 2.3 Universal Inputs All Models Need

Every fire behavior model — whether physics-based, semi-empirical, or ML — fundamentally needs data on these three factors:

| Category | Specific Inputs |
|----------|----------------|
| **Fuel** | Type/model, loading by size class, moisture content (dead 1/10/100-hr + live), height/depth, density, surface area to volume ratio, heat content |
| **Weather** | Wind speed & direction, temperature, relative humidity, precipitation, atmospheric stability |
| **Terrain** | Elevation, slope steepness, slope aspect (direction facing), terrain roughness |

Additionally, for crown fire modeling: canopy cover, canopy height, crown base height, crown bulk density, foliar moisture content.

---

## 3. MODERN AI/ML APPROACHES

### 3.1 Convolutional Neural Networks (CNNs)

**Application**: Spatial pattern recognition in fire spread — treating fire spread maps as images.

**Key Result**: CNNs can predict wildfire propagation with **3 orders of magnitude less computational cost** than traditional physics modeling (~0.01 seconds vs. ~70 seconds per case).

**Notable Systems**:
- **FirePred** — multi-temporal CNN analyzing the relationship between wildfire spread and environmental factors
- CNN models processing MODIS/VIIRS satellite imagery for next-day fire prediction
- U-Net architectures for fire perimeter segmentation

Sources:
- [Wildfire Spreading Prediction Using Multimodal Data and DNN (Nature, 2024)](https://www.nature.com/articles/s41598-024-52821-x)

### 3.2 LSTM and CNN-LSTM Hybrid Models

**Application**: Capturing temporal dynamics — how fire evolves over time steps.

**Key Models**:
- **FusionFireNet** — CNN-LSTM model for short-term wildfire hotspot prediction using spatiotemporal datasets
- **CNN-BiLSTM** — bidirectional LSTM combined with CNN for near-real-time daily wildfire spread prediction. Uses VIIRS active fire product + environmental variables (topography, land cover, temperature, NDVI, wind, precipitation, soil moisture, runoff)
- **ConvLSTM** — convolutional LSTM networks modeling wildland fire dynamics, incorporating both spatial (conv) and temporal (LSTM) information to reduce false positives

**Training Data**: LSTM algorithms trained on MODIS data covering 700,000+ observations from 2010-2022.

Sources:
- [FusionFireNet (ScienceDirect, 2024)](https://www.sciencedirect.com/science/article/abs/pii/S2352938524003008)
- [CNN-BiLSTM for Daily Wildfire Spread (MDPI Remote Sensing, 2024)](https://www.mdpi.com/2072-4292/16/8/1467)

### 3.3 Reinforcement Learning

**Novel Approach**: Fire is treated as an **agent on the landscape** taking spatial actions in reaction to its environment — modeled as a Markov Decision Process (MDP).

**Actions**: Fire can spread north, south, east, west, or not spread from any cell.

**Algorithms Tested**: Value Iteration, Policy Iteration, Q-Learning, Monte Carlo Tree Search (MCTS), A3C.

**Best Performance**: Asynchronous Advantage Actor-Critic (A3C) — **87.3% average accuracy, 0.92 AUC**.

**Validation**: Tested on Fort McMurray fire (2016) and Richardson fire (2011) in Northern Alberta using satellite imagery.

**Advantage**: Adaptable to dynamic environments, can optimize firefighting tactics with real-time feedback.

Sources:
- [Spatial RL for Wildfire Dynamics (Frontiers, Crowley et al.)](https://www.frontiersin.org/journals/ict/articles/10.3389/fict.2018.00006/full)
- [Deep RL for Firebreak Placement (arXiv, 2024)](https://arxiv.org/html/2404.08523v1)

### 3.4 Generative AI Models (2024-2025 Cutting Edge)

**Diffusion Models**:
- Denoising diffusion models learn to reverse a gradual noising process
- Generate plausible next-timestep fire perimeters conditioned on environmental factors
- Output: not a single fixed forecast but a **spectrum of plausible fire scenarios** — probabilistic outputs
- Fire perimeters defined by Huygens' principle (same as FARSITE)

**Transformers**:
- Self-attention mechanisms capture long-range spatial and temporal dependencies
- Learn how fires propagate across heterogeneous landscapes without explicitly encoding physical interactions
- Well-suited for the non-local nature of fire spread (spotting, wind-driven jumps)

**Conditional GANs**:
- Conditional Wasserstein GAN (cWGAN) trained to simulate wildfire evolution
- Tested on real California wildfires 2020-2022

**VAEs (Variational Autoencoders)**:
- Optimize stochastic latent-variable models via ELBO
- Enable learning complex distributions over fine-scale spatial fire-spread patterns

**Key Advantage**: Generative models inherently capture uncertainty — critical for fire management where deterministic predictions are dangerous.

Sources:
- [Generative AI for 2D/3D Wildfire Spread (arXiv, 2025)](https://arxiv.org/html/2506.02485v1)
- [Diffusion Model for Wildfire Spread (arXiv, 2025)](https://arxiv.org/html/2507.00761)

### 3.5 Physics-Informed Neural Networks (PINNs)

**What they are**: Neural networks that incorporate physical conservation laws (mass, energy) as constraints in the loss function — hybrid physics + ML.

**How they work for fire**:
- PiNN solves the **level-set equation** — a PDE that models fire front as the zero-level-set of a function
- Physical constraints: mass and energy conservation governing wildfire dynamics
- Learn unknown parameters of interpretable wildfire models from data

**Bayesian PINNs (B-PINNs)**:
- Provide **uncertainty quantification** in fire-front predictions
- Data assimilation approaches draw PINN predictions toward observations
- Validated against the Troy Fire (June 19, 2002, California) using ground surface thermal images

**Key Advantage**: Combines interpretability of physics models with learning capability of neural networks. Robust to noisy data — identifies same parameters even with noise.

Sources:
- [PINNs for Wildfire Parameter Learning (ScienceDirect, 2024)](https://www.sciencedirect.com/science/article/abs/pii/S0045782524007990)
- [Bayesian PINNs for Wildfire (ScienceDirect, 2023)](https://www.sciencedirect.com/science/article/abs/pii/S2211675323000210)

### 3.6 Training Data Available

| Dataset | Source | Details |
|---------|--------|---------|
| **MODIS Active Fire** (MCD14ML) | NASA FIRMS | 1km resolution, global, since 2000 |
| **VIIRS Active Fire** (VNP14IMGT) | NASA FIRMS | 375m resolution, global, since 2012. Better nighttime + small fire detection |
| **MODIS Burned Area** (MCD64A1) | NASA | 500m, monthly, maps burn date + extent |
| **LANDFIRE 2.0** | USGS/USFS | Fuel + vegetation data for all US (continental, AK, HI, PR) |
| **WildfireDB** | Open source | Wildfire propagation data from VIIRS thermal anomalies |
| **GOES-16/17** | NOAA | Geostationary, 5-min refresh, 2km resolution — real-time monitoring |
| **Sentinel-2** | ESA/Copernicus | 10-20m multispectral, 5-day revisit |
| **NIFC Historical Perimeters** | National Interagency Fire Center | Historical fire boundary polygons |

**Key finding**: VIIRS as input with VNP14 as target achieves best results for next-day fire prediction (compared to MODIS).

Sources:
- [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/)
- [FIRMS at NASA Earthdata](https://www.earthdata.nasa.gov/data/tools/firms)

---

## 4. OPERATIONAL SYSTEMS ACTUALLY DEPLOYED

### 4.1 Technosylva Wildfire Analyst — The Industry Leader

**Who uses it**: CAL FIRE, 70,000+ fire incidents since 2019, utility companies nationwide.

**How it works under the hood**:
- Core: Fire behavior libraries developed by Technosylva, built on USFS Missoula models (Rothermel, crown fire, spotting) but **enhanced for real-time operational performance**
- Runs on desktop, web, and mobile platforms
- Integrates satellite imagery, weather forecasts, real-time sensor data, fuel moisture, vegetation conditions, terrain-driven winds
- **Key innovation**: Automatic adjustment algorithm — determines optimal rate-of-spread adjustment factors by fuel model to minimize arrival-time error between simulated and observed fire. Significantly reduces error and improves fit.

**Technosylva Supercomputer (September 2025)**:
- **11,500-core** system, built with PSSC Labs
- Simulates **1+ billion fire scenarios per day**
- **2km resolution** forecasts
- Processes **terabytes of data** — thousands of critical fire variable data feeds every few hours
- Incorporates 30 years of historical fire weather patterns
- Forecasts fire risk **up to 5 days in advance**
- Identifies threatened communities and electric lines for PSPS (Public Safety Power Shutoff) decisions

**FireCast** (automated service):
- Fully automated real-time fire behavior analysis
- Simulations completed within minutes of incident notification
- Generates automated fire spread predictions every time a new detection polygon arrives

Sources:
- [Technosylva Wildfire Analyst](https://technosylva.com/products/wildfire-analyst/)
- [Technosylva Supercomputer (HPCwire, Sept 2025)](https://www.hpcwire.com/off-the-wire/technosylva-deploys-worlds-largest-dedicated-wildfire-supercomputers-to-power-ai-forecasting/)
- [Technosylva Real-Time Methods](https://technosylva.com/technosylva-develops-the-methods-to-make-fire-simulations-explain-observed-and-predicted-events-in-real-time/)

### 4.2 WIFIRE (UC San Diego) — Academic + Operational

**What it is**: End-to-end cyberinfrastructure for real-time data fusion, data-driven simulation, prediction, and visualization of wildfire behavior. Developed at UC San Diego's Supercomputer Center (SDSC).

**Core Technology**:
- **Firemap** — custom-built predictive software integrating weather forecasts, ground sensors, satellite imagery, and historical fire data
- Uses FARSITE augmented with **data assimilation** — constraint-point ensemble Kalman filtering to update wildfire perimeter predictions in real-time
- Combined CNN-LSTM classification model for spatial + temporal fire prediction
- Signal processing, visualization, modeling, and data assimilation to monitor fire patterns

**Recent Developments (2024-2025)**:
- Helped responders fight the January 2025 LA fires
- **ProWESS Center** — collaboration with Los Alamos National Lab (launched October 2024)
- Partnership with U.S. Department of Homeland Security for edge computing wildfire monitoring
- New partnership workflows utilizing edge computing for real-time response

Sources:
- [WIFIRE at UCSD](https://wifire.ucsd.edu/)
- [UCSD WIFIRE for LA Fires](https://today.ucsd.edu/story/uc-san-diegos-wifire-program-provides-real-time-information-to-wildfire-responders)

### 4.3 CAL FIRE Operational Technology Stack (2024-2025)

**AI Camera Detection**:
- 1,200+ Alert California cameras across all 21 CAL FIRE dispatch centers
- Rotate 360 degrees every 2 minutes, generating panoramic images
- AI scans images for wildfire signs
- **Result**: In 2024, detected 22% of fires in State Responsibility Area **before the 911 call**

**FireGuard**:
- Early detection + ongoing assessment
- Updates as frequently as every **10 minutes** at ~400m resolution
- Tracks fire perimeter and movement continuously from start to finish
- Generates automated fire spread prediction every time a new detection polygon arrives
- Feeds into CAD (Computer-Aided Dispatch) for automated resource routing

**NOAA Next Generation Fire System (NGFS)**:
- Satellite-based fire detection
- Available since February 2025
- 90% of NWS Weather Forecast Offices (110 of 122) subscribed to the feed
- Used by California OES on its Statewide Initial Attack Viewer

Sources:
- [CAL FIRE FireFusion 2025 (Firehouse)](https://www.firehouse.com/technology/article/55325107/firefusion-2025-cal-fires-technology-is-advancing-wildfire-response)
- [CAL FIRE Modeling Tech (GovTech)](https://insider.govtech.com/california/news/cal-fire-uses-new-modeling-tech-to-outflank-wildfires.html)

---

## 5. CELLULAR AUTOMATA AND AGENT-BASED MODELS

### 5.1 Cellular Automata (CA) for Fire Spread

**How they work**:
1. **Discretize landscape** into a grid (square or hexagonal cells)
2. Each cell has a state: unburned, burning, or burned
3. Fire spreads through **probabilistic transition rules** — a burning cell has a probability of igniting each neighbor
4. Probability modified by: topography, wind vector, fuel moisture content, fuel type
5. Uses **Moore neighborhood** (8 surrounding cells in square grid) or 6 neighbors in hexagonal grid
6. At each time step: burning cells attempt to ignite neighbors, then become burned (inactive)

**Key Systems**:
- **PROPAGATOR** — operational CA-based wildfire simulator
- Hexagonal CA models (better isotropy than square grids — fire spreads more naturally in all directions)
- Hybrid CA models driven by LSTM-based speed models

**Output**: Multiple stochastic realizations produce probability maps — each cell gets a probability of being burned. This naturally generates **uncertainty quantification**.

**Advantages over physics models**:
- Computationally fast (parallel by nature)
- Naturally stochastic — captures uncertainty
- Easy to integrate with ML (e.g., deep learning derives transition rules)
- Scales well to large landscapes

**Disadvantages**:
- Grid resolution affects accuracy
- Probabilistic rules may not capture complex physics (pyroconvection, spotting)
- Require calibration for each fuel/terrain type

**Recent Innovation (2025)**: Deep learning used to **derive CA transition rules** automatically from data, replacing hand-crafted probability functions.

Sources:
- [CA Wildfire Simulation (NHESS, 2019)](https://nhess.copernicus.org/articles/19/169/2019/)
- [PROPAGATOR Operational CA Simulator (MDPI, 2020)](https://www.mdpi.com/2571-6255/3/3/26)
- [Deep Learning Derived CA Transition Rules (ScienceDirect, 2025)](https://www.sciencedirect.com/science/article/pii/S1574954125001591)
- [Probabilistic CA Fire Spread (arXiv, 2024)](https://arxiv.org/pdf/2403.08817)

### 5.2 Agent-Based Models for Wildfire

**Concept**: Rather than modeling fire as wave propagation, model it as an agent taking actions on the landscape.

**MDP Formulation** (Crowley, University of Waterloo):
- State: landscape + fire state
- Actions: fire spreads N/S/E/W or doesn't spread
- Transition probabilities: based on fuel, weather, terrain
- Reward: accuracy of predicted spread vs. observed

**Comparison to Physics Models**:
- Agent-based: more flexible, can incorporate learning
- Physics-based: more interpretable, based on conservation laws
- Best current approach: hybrid (physics constraints + learned agent behavior)

---

## 6. THE ACCURACY PROBLEM

### 6.1 Why Fire Predictions Are Often Wrong

**Fundamental Sources of Error**:

1. **Weather uncertainty** — fire behavior is extremely sensitive to wind speed/direction. Small errors in weather forecasts amplify into large fire spread errors. Weather confidence drops significantly beyond 3 days.

2. **Fuel characterization errors** — fuel models are stylized representations of real fuel beds. Actual fuel loading, moisture, and arrangement vary enormously within a single "fuel model" classification. Fuel moisture is measured at sparse stations and interpolated.

3. **Terrain effects on microclimate** — complex terrain creates local wind patterns (channeling, eddies, slope-valley wind reversals) that coarse weather models miss entirely.

4. **Fire-atmosphere coupling** — large fires create their own weather:
   - **Pyroconvection**: fires generate convective columns that create powerful indrafts/downdrafts
   - **Pyrocumulonimbus (pyroCb)**: fire-generated thunderstorms that cause chaotic wind shifts and long-range spotting
   - **These phenomena cannot be predicted by 2D spread models** — they require coupled fire-atmosphere simulation

5. **Spotting** — ember transport over long distances (sometimes 10+ km). Highly stochastic, depends on ember size, lofting height, wind profile, and fuel receptivity. Creates new ignitions far ahead of the fire front.

6. **Model calibration** — Rothermel model overpredicts in some conditions, underpredicts in others:
   - Low wind + high moisture → underestimation of spread rate
   - High wind → overestimation
   - Timber fuels → 67% average error
   - Models trained for one region may fail in another

7. **Scale mismatch** — models predict behavior at one scale (e.g., 30m grid cells) but real fire behavior varies at much finer scales (individual tree groups, gaps, rocky outcrops).

### 6.2 Prediction Accuracy Degradation Over Time

- **0-6 hours**: Most reliable window. Weather data is freshest, fire hasn't had time to create its own weather, initial conditions are closest to reality
- **6-24 hours**: Useful but degrading. Diurnal weather cycles introduce uncertainty. Fire shape may diverge from predictions
- **1-3 days**: "Very High" confidence weather window. Spread predictions still operationally useful but require frequent updates
- **3-5 days**: Aligns with Technosylva's maximum forecast horizon. Weather forecast skill dropping. Useful for strategic planning (evacuation zones, resource positioning) but not tactical fire line decisions
- **5+ days**: Beyond reliable weather forecast range. Only useful for risk assessment, not spread prediction. Error compounds cumulatively

### 6.3 The Practical Useful Prediction Window

**Operational consensus**: **1-5 days** is the practical forecast horizon for fire spread prediction, aligned with reliable meteorological data. Within this window:
- Hourly updates are possible and valuable for active incidents
- Sub-hourly updates (Technosylva FireCast, CAL FIRE FireGuard at 10-min intervals) are emerging for tactical use
- Beyond 5 days, models switch from spread prediction to risk assessment (fire danger indices, seasonal outlooks)

Sources:
- [Limitations on Accuracy of Wildfire Models (Canadian J. Forest Research, 2013)](https://pubs.cif-ifc.org/doi/10.5558/tfc2013-067)
- [Comparing Accuracy Under Data Deficiency (MDPI Fire, 2024)](https://www.mdpi.com/2571-6255/7/4/141)
- [ML/DL for Wildfire Spread Prediction Review (MDPI Fire, 2024)](https://www.mdpi.com/2571-6255/7/12/482)

---

## 7. REAL-TIME VS FORECAST

### 7.1 Nowcasting vs Forecasting

| | Nowcasting | Forecasting |
|---|-----------|-------------|
| **Time horizon** | 0-6 hours | 6 hours to 5 days |
| **Primary data** | Satellite imagery, camera networks, sensor feeds, observed fire perimeters | Weather model outputs, fuel moisture projections, historical patterns |
| **Update frequency** | Minutes (10-min for FireGuard, 5-min for GOES satellite) | Hours (6-hourly weather updates typical) |
| **Method** | Data assimilation — adjust models to match current observations | Forward simulation — run fire models with forecast weather |
| **Accuracy** | High (anchored to current observations) | Degrades with time (depends on weather forecast skill) |
| **Use case** | Tactical: where is the fire NOW, where will it be in 2 hours? | Strategic: which communities need evacuation? Where to stage resources? |

### 7.2 Operational Update Frequencies

- **GOES-16/17 satellite**: 5-minute refresh for fire detection (coarse: 2km)
- **VIIRS (S-NPP, NOAA-20/21)**: Multiple passes per day, 375m resolution
- **Alert California AI cameras**: 360-degree panorama every 2 minutes
- **CAL FIRE FireGuard**: Updates every 10 minutes at 400m resolution
- **Technosylva FireCast**: Within minutes of incident notification
- **NOAA NGFS**: Near-real-time satellite fire detections
- **Weather forecasts**: Updated every 6 hours (GFS, NAM, HRRR — HRRR updates hourly)
- **Fire weather spot forecasts**: On-demand from NWS for active incidents

### 7.3 What Would Need to Change for Truly Real-Time AI Prediction

1. **Higher-resolution, higher-frequency satellite data** — current 375m/5-min is insufficient for tracking ember-driven spotting or crown fire runs
2. **Coupled fire-atmosphere models running in real-time** — current coupled models (WRF-Fire, WRF-SFIRE) take hours to run
3. **Dense ground sensor networks** — real-time fuel moisture, temperature, wind at high spatial density (IoT sensors, not just remote weather stations)
4. **Edge computing at incident command** — inference must happen at the fire, not in a data center (WIFIRE/DHS partnership working on this)
5. **Pre-trained generative models** — diffusion models or cWGANs that can ingest current fire state + weather and produce probabilistic spread maps in seconds
6. **Continuous data assimilation** — automatically adjust model parameters as observations stream in (Technosylva's adjustment algorithm is an early version of this)

Sources:
- [ECMWF Fire Forecasting](https://www.ecmwf.int/en/about/media-centre/science-blog/2024/machine-learning-ignites-wildfire-forecasting)
- [NOAA Hourly Fire Hazard Tool](https://research.noaa.gov/an-experimental-noaa-tool-that-predicts-hourly-wildfire-hazards-across-the-u-s/)
- [Wildfire Spread Forecasting with Deep Learning (arXiv, 2025)](https://arxiv.org/html/2505.17556v1)

---

## 8. SUMMARY TABLE — MODEL COMPARISON

| Model | Type | Spatial | Temporal | Speed | Accuracy (MAPE) | Operational |
|-------|------|---------|----------|-------|-----------------|-------------|
| Rothermel | Physics/semi-empirical | Point | Steady-state | Instant | ~47% avg | Embedded in all US tools |
| BehavePlus | Physics | Point | Static | Instant | Same as Rothermel | Training, Rx fire |
| FlamMap (static) | Physics | Raster | Constant conditions | Fast | Varies | Strategic planning |
| FARSITE | Physics | Vector/raster | Dynamic weather | Minutes-hours | Varies | Incorporated into FlamMap |
| McArthur FFDI | Empirical | Point | N/A (index) | Instant | N/A | Replaced by AFDRS (2022) |
| Canadian FBP | Semi-empirical | Point | Dynamic | Fast | Varies by fuel type | National system |
| Cellular Automata | Stochastic | Grid | Discrete steps | Fast | Varies | PROPAGATOR operational |
| CNN | ML | Raster | Snapshot | ~0.01s/case | Varies, often >80% | Research → deployment |
| CNN-LSTM | ML | Raster | Sequential | Fast | ~82% reported | Research |
| RL (A3C) | ML | Grid | Sequential | Fast | 87.3% / 0.92 AUC | Research |
| Diffusion Models | Generative AI | Raster | Sequential | Fast | Probabilistic | Emerging research |
| PINNs | Hybrid physics+ML | Continuous | Continuous | Moderate | Parameter-dependent | Research |
| Technosylva WFA | Hybrid (physics+ML+DA) | Raster | Dynamic | Minutes | Best operational | Yes — CAL FIRE, utilities |
| WIFIRE Firemap | Hybrid (FARSITE+ML+DA) | Raster | Dynamic | Fast | Research-grade | Yes — active incidents |

---

## 9. KEY TALKING POINTS FOR JUDGES

**For Hendrik Chiche (UC Berkeley ML/CV)**:
- The field is moving from pure physics to hybrid physics-informed neural networks
- PINNs solve the level-set equation with physical constraints while learning parameters from data
- Generative models (diffusion, cWGAN) are the cutting edge — probabilistic outputs with uncertainty quantification
- CNNs provide 3 orders of magnitude speedup over physics models
- A3C reinforcement learning treating fire as a landscape agent achieves 87.3% accuracy

**For Hugo Hernandez (World Models expert)**:
- World models ARE fire spread models — predicting how a physical system evolves over time given actions and conditions
- The Rothermel equation is essentially a hand-crafted world model from 1972
- Modern approach: learn the world model from data (satellite imagery sequences) using transformers/diffusion models
- FireSight uses a world model (Marble API) to generate the 3D terrain, and a fire spread model to predict how the world changes — this IS a world model application

**For judges who care about real-world impact**:
- Technosylva runs 1 billion simulations/day on an 11,500-core supercomputer
- CAL FIRE's AI cameras detect 22% of fires before 911 calls
- The January 2025 LA fires caused $76-250B in damage — better prediction could have saved lives and property
- The practical prediction window is 1-5 days; the biggest unsolved problem is fire-atmosphere coupling in extreme events
