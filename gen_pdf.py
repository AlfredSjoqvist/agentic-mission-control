from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
from reportlab.lib.units import inch

doc = SimpleDocTemplate(
    "c:/Users/Alfred/Desktop/agentic-mission-control/DEMO_SCRIPT.pdf",
    pagesize=letter,
    topMargin=0.6*inch, bottomMargin=0.6*inch,
    leftMargin=0.7*inch, rightMargin=0.7*inch
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle('Title2', parent=styles['Title'], fontSize=22, spaceAfter=4, textColor=HexColor('#1a1a1a'))
subtitle_style = ParagraphStyle('Sub', parent=styles['Normal'], fontSize=10, textColor=HexColor('#666666'), spaceAfter=12)
h2_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14, spaceBefore=16, spaceAfter=6, textColor=HexColor('#222222'))
h3_style = ParagraphStyle('H3', parent=styles['Heading3'], fontSize=11, spaceBefore=12, spaceAfter=4, textColor=HexColor('#c0392b'), bold=True)
body_style = ParagraphStyle('Body2', parent=styles['Normal'], fontSize=10, leading=14, spaceAfter=4)
action_style = ParagraphStyle('Action', parent=styles['Normal'], fontSize=9.5, leading=13, textColor=HexColor('#2c3e50'), leftIndent=12, spaceAfter=2, fontName='Helvetica-Oblique')
voice_style = ParagraphStyle('Voice', parent=styles['Normal'], fontSize=10, leading=14, leftIndent=20, rightIndent=20, spaceAfter=6, textColor=HexColor('#1a1a1a'), backColor=HexColor('#f5f5f5'), borderPadding=6)
ic_voice_style = ParagraphStyle('ICVoice', parent=voice_style, textColor=HexColor('#8e44ad'))
tip_style = ParagraphStyle('Tip', parent=styles['Normal'], fontSize=9, leading=12, leftIndent=16, spaceAfter=3, textColor=HexColor('#555555'))
check_style = ParagraphStyle('Check', parent=styles['Normal'], fontSize=9, leading=12, leftIndent=16, spaceAfter=2)

story = []

story.append(Paragraph("FireSight - 60-Second Demo Script", title_style))
story.append(Paragraph("Agentic Mission Control Track | Worlds in Action Hackathon 2026", subtitle_style))
story.append(HRFlowable(width="100%", thickness=1, color=HexColor('#cccccc')))
story.append(Spacer(1, 8))

story.append(Paragraph("SETUP BEFORE RECORDING", h2_style))
story.append(Paragraph("- App open in browser, <b>2D Map view</b> active", body_style))
story.append(Paragraph("- Fire already ignited and spreading (sim speed 10-20x)", body_style))
story.append(Paragraph("- Strategy panel visible on right (set to Offensive)", body_style))
story.append(Paragraph("- Microphone ready (V key)", body_style))
story.append(Spacer(1, 6))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor('#dddddd')))

story.append(Paragraph("THE SCRIPT", h2_style))

# 0:00-0:06
story.append(Paragraph("[0:00-0:06] OPEN ON LIVE FIRE - 2D Map View", h3_style))
story.append(Paragraph("Screen: 2D tactical map, fire already spreading. Drones orbiting. Engines moving along roads. Evacuation routes lit up.", action_style))
story.append(Paragraph("\"This is FireSight. A real-time incident command system for wildfire response. What you're seeing is a Rothermel fire physics simulation running on actual terrain data - fuel models, wind, slope - with 45 autonomous agents coordinating the response.\"", voice_style))

# 0:06-0:16
story.append(Paragraph("[0:06-0:16] AGENTS IN ACTION - 2D Map View", h3_style))
story.append(Paragraph("Screen: Point at drones orbiting fire perimeter, engines routing along roads, evacuation routes color-shifting.", action_style))
story.append(Paragraph("\"Each agent follows the ICS hierarchy - the same command structure real fire departments use. Recon drones are autonomously mapping the fire perimeter. Ground engines are routing on real road networks. Evacuation corridors are assessed and color-coded by threat level - all without manual input.\"", voice_style))

# 0:16-0:22
story.append(Paragraph("[0:16-0:22] STRATEGY CHANGE - 2D Map View", h3_style))
story.append(Paragraph("Action: Click \"Defensive\" in the strategy panel on the right. Units reposition, drones shift patterns.", action_style))
story.append(Paragraph("\"The incident commander sets strategy through the ICS panel - offensive, defensive, confine. When posture changes, all 45 agents adjust in real time. Units reposition, air ops shift priority, evacuation threat levels update.\"", voice_style))

# 0:22-0:34
story.append(Paragraph("[0:22-0:34] COMMAND CHAIN VIEW - Press 3", h3_style))
story.append(Paragraph("Screen: Force-directed graph - 45 glowing nodes, message particles flowing along edges, comms log scrolling on the right.", action_style))
story.append(Paragraph("\"This is the full command chain. 45 agents - Command, Operations, Planning, Logistics, Finance, and five AI specialists for fire prediction, drone swarm coordination, evacuation, and resource deployment. Every message between agents is logged and visualized. Agents make proposals, the IC approves or overrides, and resources move.\"", voice_style))

# 0:34-0:48
story.append(Paragraph("[0:34-0:48] 3D VIEW - Press 1", h3_style))
story.append(Paragraph("Screen: Fly over Google 3D Tiles terrain - fire burning, drones with scanner beams, helicopters with water drops, tankers with retardant. Then click a drone to enter FPV.", action_style))
story.append(Paragraph("\"The 3D view renders the same incident on real satellite terrain. Every vehicle you see - drones, helicopters, air tankers - is positioned and tasked by the agent system. You can mount any unit for a first-person view.\"", voice_style))
story.append(Paragraph("\"This also supports VR on PICO headsets for full spatial immersion.\"", voice_style))

# 0:48-0:57
story.append(Paragraph("[0:48-0:57] CLOSE - 3D Wide Shot", h3_style))
story.append(Paragraph("Action: ESC out of FPV, pull back to wide 3D overview with fire and all units visible.", action_style))
story.append(Paragraph("\"FireSight is a complete agentic mission control - voice-driven, real-time, built on real ICS protocol. 45 agents, real fire physics, three operational views, and full spatial support.\"", voice_style))

# 0:57-1:00
story.append(Paragraph("[0:57-1:00] END", h3_style))
story.append(Paragraph("Hold on wide 3D shot or cut to title card.", action_style))
story.append(Paragraph("\"FireSight.\"", voice_style))

story.append(Spacer(1, 10))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor('#dddddd')))

# Checklist
story.append(Paragraph("FEATURES TO VISUALLY HIT", h2_style))
checklist = [
    "Fire spreading with red/orange animation on 2D map",
    "Drones autonomously orbiting fire perimeter",
    "Ground units moving along road networks",
    "Evacuation routes color-coded (green/yellow/red)",
    "Strategy panel click from Offensive to Defensive, units reposition",
    "Command chain graph - 45 nodes with message particles",
    "Comms log scrolling with agent-to-agent messages",
    "3D terrain flyover with fire + all vehicle types",
    "Drone FPV mount with HUD stats",
    "Minimap in 3D view showing 2D tactical overview",
    "VR/PICO mentioned verbally",
]
for item in checklist:
    story.append(Paragraph(f"[ ]  {item}", check_style))

story.append(Spacer(1, 10))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor('#dddddd')))

# Tips
story.append(Paragraph("RECORDING TIPS", h2_style))
tips = [
    "<b>Fire should already be burning</b> when you start - don't waste time igniting on camera",
    "<b>Sim speed 10-20x</b> so fire spread and unit movement are visually active",
    "<b>Pre-set to Offensive</b> so the click to Defensive is a visible change",
    "<b>Screen record at 1080p</b> - dark UI + fire colors pop at high res",
    "<b>Every click deliberate</b> - no cursor wandering",
]
for i, tip in enumerate(tips, 1):
    story.append(Paragraph(f"{i}. {tip}", tip_style))

doc.build(story)
print("PDF created successfully at DEMO_SCRIPT.pdf")
