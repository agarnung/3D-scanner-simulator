# Leer coordenadas 3D (x y z) desde un .txt, una por línea.
# Detectar cuándo la z cambia con respecto a la anterior.
# Asumir que originalmente todas las z eran 0.0, y que cada vez que había un cambio, era un aumento de 0.01, pero ahora el archivo tiene aumentos de 0.1 (o cualquier otro valor más grande).
# Recalcular todas las z usando 0.01 por cada "salto", en vez del valor que esté actualmente.

import sys
from tqdm import tqdm

# Para evitar diferencias marginales por cuestionies de precisión de punto flotante
def float_casi_igual(a, b, tol=1e-5):
    return abs(a - b) < tol

def ajustar_z(input_file, output_file, nuevo_incremento=0.01, tolerancia=1e-5):
    with open(input_file, 'r') as f:
        lineas = f.readlines()

    nuevas_lineas = []
    z_unicas = []      # lista ordenada de z originales únicas (según tolerancia)
    z_mapeo = {}       # mapeo: z original -> z nueva corregida

    for linea in tqdm(lineas, desc="Procesando perfiles", unit="perfil"):
        partes = linea.strip().split()
        if len(partes) != 3:
            nuevas_lineas.append(linea)
            continue

        x, y, z = partes
        try:
            z_float = float(z)
        except ValueError:
            nuevas_lineas.append(linea)
            continue

        # Buscar si esta z ya está en nuestra lista única (según tolerancia)
        encontrado = False
        for z_existente in z_unicas:
            if float_casi_igual(z_float, z_existente, tolerancia):
                z_corregida = z_mapeo[z_existente]
                encontrado = True
                break

        if not encontrado:
            z_corregida = len(z_unicas) * nuevo_incremento
            z_unicas.append(z_float)
            z_mapeo[z_float] = z_corregida

        nuevas_lineas.append(f"{x} {y} {z_corregida:.6f}\n")

    with open(output_file, 'w') as f:
        f.writelines(nuevas_lineas)

    print(f"✅ Coordenadas corregidas guardadas en: '{output_file}'")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python reunravell.py <input.txt> <output.txt> [incremento]")
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2]
        incremento = float(sys.argv[3]) if len(sys.argv) >= 4 else 0.01
        tolerancia = float(sys.argv[4]) if len(sys.argv) >= 5 else 1e-5
        ajustar_z(input_file, output_file, incremento, tolerancia)
