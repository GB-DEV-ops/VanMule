"""Builds RVC v2 ONNX templates (graph + layout manifest, no voice weights).
The app fills in a voice's weights from its .pth file at import time."""
import sys, os, json, argparse
import numpy as np
import torch, onnx
from onnx import numpy_helper, external_data_helper

ap = argparse.ArgumentParser()
ap.add_argument('--rvc', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--det', action='store_true', help='deterministic build for testing (no random ops)')
ap.add_argument('--only', default='')
args = ap.parse_args()
sys.path.insert(0, args.rvc)
from infer.lib.infer_pack.models_onnx import SynthesizerTrnMsNSFsidM

if args.det:
    torch.rand = lambda *a, **k: torch.zeros(*a, **{x: y for x, y in k.items() if x in ('device', 'dtype')})
    torch.randn_like = lambda t, *a, **k: torch.zeros_like(t)

RB = [[1, 3, 5], [1, 3, 5], [1, 3, 5]]
CFG = {
    '40k': [1025, 32, 192, 192, 768, 2, 6, 3, 0, '1', [3, 7, 11], RB, [10, 10, 2, 2], 512, [16, 16, 4, 4], 109, 256, 40000],
    '48k': [1025, 32, 192, 192, 768, 2, 6, 3, 0, '1', [3, 7, 11], RB, [12, 10, 2, 2], 512, [24, 20, 4, 4], 109, 256, 48000],
    '32k': [513, 32, 192, 192, 768, 2, 6, 3, 0, '1', [3, 7, 11], RB, [10, 8, 2, 2], 512, [20, 16, 4, 4], 109, 256, 32000],
}
CHECK = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 16]
os.makedirs(args.out, exist_ok=True)
for key, cfg in CFG.items():
    if args.only and key != args.only:
        continue
    torch.manual_seed(1)
    net = SynthesizerTrnMsNSFsidM(*cfg, is_half=False, version='v2').eval()
    with torch.no_grad():  # make every parameter unique so the exporter can't merge identical ones
        for prm in net.parameters():
            prm.add_(torch.randn(prm.shape) * 1e-3)
    sd = {k: v for k, v in net.state_dict().items() if 'enc_q' not in k}
    T = 200
    inputs = (torch.rand(1, T, 768), torch.tensor([T]).long(), torch.randint(5, 255, (1, T)), torch.rand(1, T) * 200 + 100,
              torch.LongTensor([0]), torch.rand(1, 192, T))
    tmp = os.path.join(args.out, f'_tmp_{key}.onnx')
    with torch.no_grad():
        torch.onnx.export(net, inputs, tmp, dynamic_axes={'phone': [1], 'pitch': [1], 'pitchf': [1], 'rnd': [2]},
                          do_constant_folding=False, opset_version=17, input_names=['phone', 'phone_lengths', 'pitch', 'pitchf', 'ds', 'rnd'],
                          output_names=['audio'], dynamo=False)
    m = onnx.load(tmp)
    name = f'rvc_v2_{key}' + ('_det' if args.det else '')
    data_file = 'model.onnx.data'
    inits, consts, offset, cbuf = [], [], 0, bytearray()
    used = set()
    for init in m.graph.initializer:
        arr = numpy_helper.to_array(init)
        if arr.dtype == np.float64:
            arr = arr.astype(np.float32)
        raw = arr.tobytes()
        entry = {'name': init.name, 'dims': list(arr.shape), 'dtype': str(arr.dtype), 'offset': offset, 'length': len(raw)}
        if init.name in sd and tuple(sd[init.name].shape) == arr.shape and arr.dtype == np.float32:
            entry['source'] = 'weight'; entry['weight'] = init.name; used.add(init.name)
        else:
            entry['source'] = 'const'; entry['constOffset'] = len(cbuf); cbuf += raw
        inits.append(entry)
        new = numpy_helper.from_array(arr, init.name)
        init.CopyFrom(new)
        external_data_helper.set_external_data(init, location=data_file, offset=offset, length=len(raw))
        init.ClearField('raw_data')
        init.data_location = onnx.TensorProto.EXTERNAL
        offset += len(raw)
        pad = (-offset) % 64
        offset += pad
    missing = [k for k in sd if k not in used]
    onnx.save(m, os.path.join(args.out, name + '.onnx'))
    with open(os.path.join(args.out, name + '.const.bin'), 'wb') as f:
        f.write(cbuf)
    man = {'config': cfg, 'checkConfig': CHECK, 'ginChannels': 256, 'dataFile': data_file, 'dataSize': offset, 'initializers': inits}
    with open(os.path.join(args.out, name + '.json'), 'w') as f:
        json.dump(man, f)
    os.remove(tmp)
    print(key, 'initializers', len(inits), 'weights', sum(1 for i in inits if i['source'] == 'weight'), 'consts', sum(1 for i in inits if i['source'] == 'const'),
          'const bytes', len(cbuf), 'unmapped state keys', len(missing), missing[:6], 'onnx size', os.path.getsize(os.path.join(args.out, name + '.onnx')))
