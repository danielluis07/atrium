"""OIDN-denoise a baked lightmap through Blender's compositor (bpy 5.2). build.py runs it in a fresh
process, since it rebuilds the scene.

    uv run python denoise.py in.exr out.exr
"""

import os
import sys
import time

import bpy


def denoise(src, dst):
    t = time.time()
    img = bpy.data.images.load(os.path.abspath(src))
    w, h = img.size
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.render.resolution_x, scene.render.resolution_y = w, h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    for o in list(scene.objects):
        bpy.data.objects.remove(o)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam

    tree = bpy.data.node_groups.new("comp", "CompositorNodeTree")
    scene.compositing_node_group = tree
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    n_img = tree.nodes.new("CompositorNodeImage")
    n_img.image = img
    n_dn = tree.nodes.new("CompositorNodeDenoise")
    out = tree.nodes.new("NodeGroupOutput")
    tree.links.new(n_img.outputs["Image"], n_dn.inputs["Image"])
    tree.links.new(n_dn.outputs["Image"], out.inputs[0])

    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "16"
    scene.render.filepath = os.path.abspath(dst)
    bpy.ops.render.render(write_still=True)
    print(f"denoised {src} -> {dst} in {time.time() - t:.1f} s", flush=True)


if __name__ == "__main__":
    denoise(sys.argv[1], sys.argv[2])
