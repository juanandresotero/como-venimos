import collections
import unittest

from robot import almacen


class TestImportacionReal(unittest.TestCase):
    """Verifica el resultado guardado en datos/negocios.json contra lo que ya sabemos
    del Excel del usuario (analizado a mano el 2026-08-17)."""

    @classmethod
    def setUpClass(cls):
        cls.negocios = almacen.leer_json("negocios.json", None)

    def test_el_archivo_existe(self):
        self.assertIsNotNone(self.negocios, "falta datos/negocios.json — corre el importador")

    def test_hay_85_negocios(self):
        self.assertEqual(len(self.negocios), 85)

    def test_46_alquileres_y_39_ventas(self):
        tipos = collections.Counter(n["tipo_negocio"] for n in self.negocios)
        self.assertEqual(tipos["alquiler"], 46)
        self.assertEqual(tipos["venta"], 39)

    def test_la_facturacion_de_los_anios_viejos_coincide_con_el_excel(self):
        esperado = {"2022": 1770, "2023": 58984, "2024": 40125, "2025": 43965}
        real = collections.defaultdict(float)
        for n in self.negocios:
            if n["fecha_fin"] and n["facturacion"] and n["estado"] == "cerrado":
                real[n["fecha_fin"][:4]] += n["facturacion"]
        for anio, monto in esperado.items():
            self.assertAlmostEqual(real[anio], monto, delta=3, msg=f"año {anio}")

    def test_las_puntas_promedio_dan_1_59(self):
        promedio = sum(n["puntas"] for n in self.negocios) / len(self.negocios)
        self.assertAlmostEqual(promedio, 1.59, places=2)

    def test_los_negocios_de_2026_estan_recalculados(self):
        """Desde 2026 se recalcula con las reglas nuevas; antes se respeta el Excel.

        No se fija una cantidad exacta a proposito: el usuario esta corrigiendo las fechas
        que habia inventado, y cada una que borra saca una fila de este grupo. Lo que
        importa es que TODAS las que quedan esten recalculadas con su categoria.
        """
        de_2026 = [n for n in self.negocios if n["fecha_fin"] and n["fecha_fin"] >= "2026-01-01"]
        self.assertGreater(len(de_2026), 0)
        for n in de_2026:
            self.assertTrue(n["recalculado"], f"{n['id']} no se recalculo")
            self.assertEqual(n["categoria_vigente"], "RAP")

    def test_los_negocios_viejos_NO_estan_recalculados(self):
        viejos = [n for n in self.negocios if n["fecha_fin"] and n["fecha_fin"] < "2026-01-01"]
        for n in viejos:
            self.assertFalse(n["recalculado"], f"{n['id']} se recalculo y no debia")

    def test_detecta_la_fila_82_como_firma_inventada(self):
        # San Fructuoso: dada por firmada, pero la propiedad sigue reservada en RE/MAX.
        n = next(x for x in self.negocios if x["id"] == "excel-82")
        self.assertEqual(n["estado"], "en_curso")
        self.assertTrue(n["fecha_fin_estimada"])
        self.assertIsNotNone(n["entity_id_cartera"])

    # Los avisos del importador ("tu Excel dice X pero la cuenta da Y") se dejaron de
    # mostrar: ese Excel quedo viejo y la app pasa a ser la fuente de verdad. Lo que se
    # sigue verificando es que los VALORES hayan quedado bien corregidos.

    def test_la_fila_37_recupero_la_coma_decimal(self):
        # La celda decia 770048; el valor real es 770,048. Sin esto, 2024 daba 809.403.
        n = next(x for x in self.negocios if x["id"] == "excel-37")
        self.assertAlmostEqual(n["facturacion"], 770.048, places=3)

    def test_la_fila_51_quedo_con_el_porcentaje_bien_puesto(self):
        # La celda guardaba 26,25 en vez de 2,625%. El facturado (2.310) siempre fue el
        # correcto: 88.000 x 0,02625 = 2.310.
        n = next(x for x in self.negocios if x["id"] == "excel-51")
        self.assertEqual(n["facturacion"], 2310.0)
        self.assertAlmostEqual(n["pct_comision_total"], 0.02625, places=5)
        self.assertAlmostEqual(
            n["precio_operacion"] * n["pct_comision_total"], 2310.0, places=2
        )

    def test_ninguna_firma_futura_cuenta_como_cobrada(self):
        for n in self.negocios:
            if n["fecha_fin"] and n["fecha_fin"] > "2026-08-17":
                self.assertEqual(n["estado"], "en_curso", n["id"])

    def test_los_negocios_sin_fecha_de_inicio_son_los_que_el_robot_no_puede_saber(self):
        """El Excel dejo 17 filas sin fecha de inicio.

        La app rellena sola la de los negocios enganchados a una propiedad de la cartera,
        porque el robot sabe cuando se empezo a publicar. Las que quedan son las de
        propiedades que el robot nunca vio, y esas hay que cargarlas a mano.
        """
        sin_inicio = [n for n in self.negocios if not n["fecha_inicio"]]
        self.assertLessEqual(len(sin_inicio), 17)
        for n in sin_inicio:
            self.assertIsNone(
                n.get("entity_id_cartera"),
                f"{n['id']} esta en la cartera: la fecha la tendria que poner el robot",
            )

    def test_los_barrios_quedaron_normalizados(self):
        barrios = {n["barrio"] for n in self.negocios if n["barrio"]}
        minusculas = {b.lower() for b in barrios}
        self.assertEqual(len(barrios), len(minusculas),
                         "hay barrios que solo difieren en mayusculas")

    def test_todos_tienen_regimen_valido(self):
        from negocios import motor
        for n in self.negocios:
            self.assertIn(n["regimen_comision"], motor.REGIMENES, n["id"])

    def test_ninguno_tiene_ganancia_mayor_que_la_facturacion(self):
        # Salvo las suplencias, que no facturan pero si dejan ganancia.
        for n in self.negocios:
            if n["regimen_comision"] == "suplencia":
                continue
            if n["facturacion"] and n["ganancia"]:
                self.assertLessEqual(n["ganancia"], n["facturacion"] + 0.01, n["id"])


if __name__ == "__main__":
    unittest.main()
