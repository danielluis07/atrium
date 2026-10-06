# Atrium

The website of Atrium, a fictional architecture studio based in northern Norway. Visitors explore the studio's work through an interactive 3D landscape of houses in the snow, then read about the studio itself.

## Language

### Studio

**Atrium**:
The fictional architecture studio this site presents. It is based in northern Norway and designs modernist houses for Arctic sites.
_Avoid_: the firm, the agency, the company

**Atrium Mark**:
The Studio's official geometric brand symbol: offset modernist volumes arranged around a square central void, reading as both a House and an atrium plan.
_Avoid_: house icon, home icon, loading icon

**Project**:
One house the studio designed, named "<Place> House" after the real Arctic place it stands in (e.g. Lyngen House). It has a location, elevation, year, floor area, a one-sentence lede and a write-up in three parts: Site, Light and Material. It has no coordinates. Each Project is shown as exactly one House in the Scene.
_Avoid_: work, case study, build, property

### Site

**Threshold**:
The screen a visitor sees while the live Scene gets ready: the Atrium Mark and wordmark in the centre over the dusk sky, a one-line description of the studio, snow falling slowly and a scale bar filling with the load. It clears once the Scene is ready, and a visitor sees it once per visit. Visitors shown the still of the Scene have nothing to wait for and never see it.
_Avoid_: loader, loading screen, splash, intro

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
Any furnished room of a House: the room inside one volume, seen through every Glazing Face into that volume, and through the glazed back wall of a terrace cut into it. It has one kind, what the room is mainly for (lounge, dining, kitchen, library, bedroom), and a furnishing, which may give it other uses besides (a dining room may have a kitchen run behind its table, or seating at one end). A House may have several. Houses share one set of furniture and differ in how their Interiors are composed. Other glazing looks into a warm room with no furniture.
_Avoid_: room, set, furniture layout

**Hero Interior**:
A House's main Interior: the one behind the Glazing Face its Project's interior image names. Every House has one, and a House may have other Interiors besides it (Senja's living room, under the bar, and Reine's bedroom, on the top floor).
_Avoid_: main room, showroom

**Curtain**:
A warm sheer hung just inside a Glazing Face that looks into no Interior, closed across all of its glass and lit from behind by the room. It is drawn by the glazing shader, not baked, and glows and lifts on hover like every window. The one exception to "no Interior" is glass into the empty room behind a partition.
_Avoid_: blind, drape, shade

**Site Works**:
The built pieces around a House and the snow they shape. The pieces are walls, steps, paths, terraces, aprons and the small warm lights set into them, in the House's own materials. The snow includes caps on their tops, drifts against them, and the lip and berms of a path cut into the snow. They stand on the House's plinth (the patch of baked snow it stands in) and are baked with the House. A House's Snow Shrubs are part of its Site Works. Pines are not.
_Avoid_: landscaping, garden, hardscape, props

**Snow Shrub**:
A low shrub almost buried in snow, part of a House's Site Works: a soft snow mound with dark twig tips showing, modelled and baked with the House. It is the only planting in the Scene besides the pines.
_Avoid_: bush, plant, planting, garden

**Balcony Furniture**:
The pieces set out on a House's balcony, such as seats, tables, a hot tub, a telescope, pots and the small warm lights among them. They're built in the House's materials and baked with the House. Unlike Site Works, they stand on a slab, not on the plinth.
_Avoid_: props, decor, outdoor set, terrace furniture

**Project Panel**:
The paper sheet that opens over the Scene when a House is selected, summarising its Project and linking to the Project page.
_Avoid_: modal, popup, card, drawer

**Project Index**:
The plain list of all Projects outside the Scene, set out like a schedule on a drawing: one row per Project. It is the way to reach Projects without 3D.
_Avoid_: gallery, portfolio, grid

**Section Cut**:
The scroll transition out of the Scene: the camera drops toward the ground and the page "below grade", in the shadowed foreground snow's colour, rises over the Scene behind its Grade Line, divided into Depths.
_Avoid_: Whiteout, fade, transition

**Grade Line**:
The undulating top of the below-grade page, drawn as snow drifts in section. It rises with the Section Cut, its drifts standing dark against the Scene above them, and a band of plain below-grade snow lies between it and the first Depth.
_Avoid_: seam, edge, wave, section line

**Depth**:
A home page section below the Section Cut, marked with how far below grade it sits (e.g. −1.00 Projects, −2.00 Studio), like a level mark on a section drawing.
_Avoid_: Level, layer, chapter
