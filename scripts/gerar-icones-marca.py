#!/usr/bin/env python3
"""Regera os ícones do Murade Contábil com a cor da marca (âmbar). Uso: python3 scripts/gerar-icones-marca.py <icone-original-512.png>
Mantém o símbolo (calculadora + pena) e o texto; recolore o fundo para âmbar escuro e põe aro/halo luminoso na cor da marca."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
MARCA=(217,119,6); ESCURO=(43,23,7); MEIO=(92,52,12)
src=Image.open(sys.argv[1]).convert('RGBA'); N=512
# máscara do cantos arredondados do ícone original (alfa) e do símbolo claro (prata/branco)
alfa=src.split()[3]
rgb=src.convert('RGB'); lum=rgb.convert('L')
# símbolo = pixels claros e pouco saturados (prata/branco); fundo = azul
sat=ImageChops.subtract(rgb.split()[2],rgb.split()[0])  # B-R: alto no fundo azul
fgm=lum.point(lambda v:255 if v>120 else 0).filter(ImageFilter.MaxFilter(3))
sat_m=sat.point(lambda v:255 if v<60 else 0)
simb=ImageChops.multiply(fgm,sat_m).filter(ImageFilter.GaussianBlur(0.6))
# fundo âmbar escuro com leve gradiente radial
fundo=Image.new('RGB',(N,N),ESCURO)
rad=Image.radial_gradient('L').resize((N,N)).point(lambda v:255-v)
fundo=Image.composite(Image.new('RGB',(N,N),MEIO),fundo,rad.point(lambda v:int(v*0.55)))
# conteúdo original (luminância do símbolo) tingido: prata levemente quente
quente=Image.merge('RGB',[lum.point(lambda v:min(255,int(v*1.0))),lum.point(lambda v:min(255,int(v*0.97))),lum.point(lambda v:min(255,int(v*0.9)))])
out=Image.composite(quente,fundo,simb)
# halo luminoso na cor da marca atrás do símbolo
halo=Image.new('RGBA',(N,N),MARCA+(0,)); h=simb.filter(ImageFilter.GaussianBlur(14)).point(lambda v:int(v*0.55))
halo.putalpha(h)
base=out.convert('RGBA'); base=Image.composite(Image.new('RGBA',(N,N),MARCA+(255,)),base,h.point(lambda v:int(v*0.9)))
base=Image.composite(quente.convert('RGBA'),base,simb)
# aro na cor da marca na borda
d=ImageDraw.Draw(base); r=int(N*0.2)
d.rounded_rectangle((7,7,N-8,N-8),radius=r,outline=MARCA+(255,),width=10)
base.putalpha(alfa)
base.save('public/icone-app-512.png',optimize=True)
base.resize((192,192),Image.LANCZOS).save('public/icone-app-192.png',optimize=True)
base.resize((48,48),Image.LANCZOS).save('public/favicon-48.png',optimize=True)
ap=Image.new('RGB',(N,N),ESCURO); ap.paste(base,(0,0),base); ap.resize((180,180),Image.LANCZOS).save('public/apple-touch-icon.png',optimize=True)
