"""Codex-authored CadQuery recipe: trapezoidal blades with through-holes.

This executable recipe is an example input to the generic CAD/STL bridge, not
a new shape enum in the CFD solver. All CAD dimensions and STL vertices are mm.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import cadquery as cq

DEFAULTS=dict(tank_diameter_mm=150.,liquid_height_mm=150.,impeller_diameter_mm=50.,
    clearance_mm=50.,shaft_radius_mm=4.,blade_count=6,blade_phase_deg=-30.,
    outer_blade_height_ratio=.175,hole_diameter_mm=4.,hole_radius_position_ratio=.4375,
    baffle_count=4,baffle_width_mm=15.,baffle_thickness_mm=2.,baffle_wall_gap_mm=2.5,
    rpm=2672.,stl_tolerance_mm=.00625)

def build(parameters,output):
    if set(parameters)-set(DEFAULTS):raise ValueError('Unknown CAD parameter')
    p={**DEFAULTS,**parameters}
    if any(type(v) not in (int,float) or not math.isfinite(v) for v in p.values()):raise ValueError('Finite CAD parameters required')
    if type(p['blade_count']) is not int or not 2<=p['blade_count']<=12 or type(p['baffle_count']) is not int or not 0<=p['baffle_count']<=12:raise ValueError('Invalid part counts')
    if any(p[k]<=0 for k in ['tank_diameter_mm','liquid_height_mm','impeller_diameter_mm','shaft_radius_mm','stl_tolerance_mm']):raise ValueError('Positive dimensions required')
    out=Path(output);out.mkdir(parents=True,exist_ok=False);parts=[];cad_report=[]
    D=p['impeller_diameter_mm'];H=p['liquid_height_mm'];T=p['tank_diameter_mm'];C=p['clearance_mm'];dx=T/240
    inner=D*.25;outer=D*.5;hi=D*.2;ho=D*p['outer_blade_height_ratio'];thick=D*.04;hole_x=D*p['hole_radius_position_ratio'];hr=p['hole_diameter_mm']/2
    if not 0<=hr or min(hi,ho,thick)<dx or (hr and (2*hr<2*dx or hole_x-hr<=D*.375+dx or hole_x+hr>=outer-dx or hr>=min(hi,ho)/2-dx)):
        raise ValueError('Unresolved blade/hole or hole intersects disc/outer boundary')
    if not 0<ho<=hi or C-hi/2<=2*dx or C+hi/2>=H-2*dx:raise ValueError('Invalid blade envelope')
    omega=p['rpm']*2*math.pi/60
    def add(name,shape,role='solid',group='rotor'):
        solid=shape.val() if isinstance(shape,cq.Workplane) else shape
        if not solid.isValid() or len(solid.Solids())!=1 or solid.Volume()<=0:raise ValueError('Invalid CAD solid: '+name)
        path=out/(name+'.stl')
        # Explicit absolute tolerance in mm; the generic exporter defaults to
        # relative deflection, which is unsuitable for a fixed CFD grid.
        if not solid.exportStl(str(path),tolerance=p['stl_tolerance_mm'],angularTolerance=.08,relative=False):raise ValueError('STL export failed')
        cq.exporters.export(solid,str(out/(name+'.step')),exportType='STEP')
        parts.append(dict(name=name,file=path.name,role=role,material=2 if role=='container' else 3 if group=='baffles' else 1,group=group,
            motion=dict(center=[0,0,0],omega=[0,0,omega if group=='rotor' else 0],translation_velocity=[0,0,0])))
        cad_report.append(dict(name=name,volume_mm3=solid.Volume(),valid=True,stl_sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    def cylinder(radius,height,z=0):return cq.Solid.makeCylinder(radius,height,cq.Vector(0,0,z),cq.Vector(0,0,1))
    add('vessel',cylinder(T/2,H),role='container',group='vessel')
    add('shaft',cylinder(p['shaft_radius_mm'],H))
    add('disc_0',cylinder(.375*D,.04*D,C-.02*D))
    add('hub_0',cylinder(.16*D,.2*D,C-.1*D))
    blade=cq.Workplane('XZ').polyline([(inner,-hi/2),(outer,-ho/2),(outer,ho/2),(inner,hi/2)]).close().extrude(thick/2,both=True)
    if hr:
        hole=cq.Solid.makeCylinder(hr,thick+2,cq.Vector(hole_x,-thick/2-1,0),cq.Vector(0,1,0))
        blade=blade.cut(hole)
    probes=[]
    for i in range(p['blade_count']):
        angle=p['blade_phase_deg']+i*360/p['blade_count'];a=math.radians(angle)
        add(f'blade_0_{i}',blade.translate((0,0,C)).rotate((0,0,0),(0,0,1),angle))
        probes.append(dict(part=f'blade_0_{i}',hole_center_mm=[hole_x*math.cos(a),hole_x*math.sin(a),C],
            solid_neighbor_mm=[hole_x*math.cos(a),hole_x*math.sin(a),C+hr+1.25],hole_radius_mm=hr))
    for i in range(p['baffle_count']):
        r=T/2-p['baffle_wall_gap_mm']-p['baffle_width_mm']/2
        baffle=cq.Workplane('XY').box(p['baffle_width_mm'],p['baffle_thickness_mm'],H).translate((r,0,H/2)).rotate((0,0,0),(0,0,1),i*360/p['baffle_count'])
        add(f'baffle_{i}',baffle,group='baffles')
    length=max(T,H)+10
    scene=dict(schema='cad-stl-scene-v1',units='mm',bounds=[[-length/2,-length/2,(H-length)/2],[length/2,length/2,(H+length)/2]],resolution=64,parts=parts,
        native014=dict(tank_diameter_m=T*.001,liquid_height_m=H*.001,shaft_radius_m=p['shaft_radius_mm']*.001,
            impeller_diameter_m=D*.001,impeller_levels_m=[C*.001],blade_count=p['blade_count'],blade_phase_deg=p['blade_phase_deg'],
            baffle_count=p['baffle_count'],baffle_width_m=p['baffle_width_mm']*.001,baffle_thickness_m=p['baffle_thickness_mm']*.001,baffle_wall_gap_m=p['baffle_wall_gap_mm']*.001,rpm=p['rpm']),
        geometry_features=dict(blade_profile='trapezoid',hole_diameter_mm=2*hr,expected_blade_euler_number=0 if hr else 2,verification_points=probes),
        container_boundary=dict(side='IBM no slip',bottom='native no slip',top='native free slip'))
    (out/'scene.json').write_text(json.dumps(scene,indent=2)+'\n');(out/'parameters.json').write_text(json.dumps(p,indent=2)+'\n')
    (out/'cad_report.json').write_text(json.dumps(dict(cadquery_version=cq.__version__,parts=cad_report,parameters=p,physical_validation=False),indent=2)+'\n')
    return scene

if __name__=='__main__':
    q=argparse.ArgumentParser();q.add_argument('--parameters',required=True);q.add_argument('--output',required=True);a=q.parse_args()
    scene=build(json.loads(Path(a.parameters).read_text()),a.output);print(json.dumps(dict(parts=len(scene['parts']),output=a.output)))
