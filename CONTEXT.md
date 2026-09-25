# Atrium

The website of Atrium, a fictional architecture studio based in northern Norway. Visitors explore the studio's work through an interactive 3D landscape of houses in the snow, then read about the studio itself.

## Language

### Studio

**Atrium**:
The fictional architecture studio this site presents. It is based in northern Norway and designs modernist houses for Arctic sites.
_Avoid_: the firm, the agency, the company

**Project**:
One house the studio designed, named "<Place> House" after the real Arctic place it stands in (e.g. Lyngen House). It has a location, elevation, year, floor area, a one-sentence lede and a write-up in three parts: Site, Light and Material. It has no coordinates. Each Project is shown as exactly one House in the Scene.
_Avoid_: work, case study, build, property

### Site

**Scene**:
The interactive 3D landscape at blue hour (dusk) where the studio's Houses stand in the snow. It is the hero of the home page.
_Avoid_: world, canvas, 3D view

**House**:
The 3D representation of a Project inside the Scene. Selecting a House reveals its Project.
_Avoid_: model, building, mesh

**Level**:
One floor of a House.
_Avoid_: storey, floor (in data), Depth

**Glazing Face**:
One named, full-height glazed opening in a House, facing one compass direction. Interior images are framed by a Glazing Face and look out through it.
_Avoid_: window (in data), glass, pane

**Interior**:
The furnished room inside one volume of a House, seen through every Glazing Face into that volume. It has a kind (lounge, dining, kitchen, library, bedroom) and a furnishing. Houses share one set of furniture and differ in how their Interiors are composed. Other glazing looks into a warm room with no furniture.
_Avoid_: room, set, furniture layout

**Hero Interior**:
A House's main Interior: the one behind the Glazing Face its Project's interior image names. For now it is the only furnished Interior in each House.
_Avoid_: main room, showroom

**Project Panel**:
The paper sheet that opens over the Scene when a House is selected, summarising its Project and linking to the Project page.
_Avoid_: modal, popup, card, drawer

**Project Index**:
The plain list of all Projects outside the Scene, set out like a schedule on a drawing: one row per Project. It is the way to reach Projects without 3D.
_Avoid_: gallery, portfolio, grid

**Section Cut**:
The scroll transition out of the Scene: the camera drops toward the ground and the snow surface becomes a section line, with the Scene above it and the paper page below it, "below grade", divided into Depths.
_Avoid_: Whiteout, fade, transition

**Depth**:
A home page section below the Section Cut, marked with how far below grade it sits (e.g. −1.00 Projects, −2.00 Studio), like a level mark on a section drawing.
_Avoid_: Level, layer, chapter
