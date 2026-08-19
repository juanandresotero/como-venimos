# -*- coding: utf-8 -*-
"""Los indices para reajustar alquileres.

Las fixtures son recortes de las paginas y la planilla de verdad, bajadas el 18/8/2026.
Los numeros que se afirman aca no salieron de correr el codigo y copiar lo que dio: salen
de tres lados que coinciden entre si —la tabla de Caja Notarial, el informe del INE y la
cuenta del articulo 15 hecha con los indices crudos del MEF— y por eso se pueden usar para
decidir si el codigo esta bien.
"""
from __future__ import annotations

import io
import os
import unittest

from robot import indices

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def leer(nombre: str) -> str:
    with io.open(os.path.join(FIXTURES, nombre), encoding="utf-8") as archivo:
        return archivo.read()


def leer_bytes(nombre: str) -> bytes:
    with open(os.path.join(FIXTURES, nombre), "rb") as archivo:
        return archivo.read()


class TestLeerLasFuentes(unittest.TestCase):
    def test_coeficientes_de_caja_notarial(self):
        coeficientes = indices.coeficientes_publicados(leer("indices_caja.html"))
        self.assertEqual(coeficientes["2026-08"], 1.0427)
        self.assertEqual(coeficientes["2026-06"], 1.0377)
        self.assertEqual(len(coeficientes), 8)

    def test_el_ipc_sale_del_informe_del_ine(self):
        # "El IPC de Julio 2026 registro una variacion (...) en los ultimos 12 meses de 4,27%"
        self.assertEqual(indices.variacion_ipc(leer("indices_ipc_ine.html")), 1.0427)

    def test_sin_el_dato_no_inventa_un_numero(self):
        self.assertIsNone(indices.variacion_ipc("<p>El informe todavia no salio.</p>"))
        self.assertEqual(indices.coeficientes_publicados("<p>nada</p>"), {})

    def test_el_enlace_del_mef_se_encuentra_aunque_cambie_todos_los_meses(self):
        enlace = indices.enlace_planilla(leer("indices_mef_pagina.html"))
        self.assertTrue(enlace.endswith(".ods"))
        self.assertIn("2026-08", enlace)

    def test_la_planilla_del_mef_se_abre_sin_instalar_nada(self):
        series = indices.series_planilla(leer_bytes("indices_mef.ods"))
        self.assertGreater(len(series), 100)
        self.assertEqual(series["2026-05"]["ipc"], 117.69)
        self.assertEqual(series["2026-05"]["ura"], 1917.71)

    def test_los_miles_con_punto_no_se_leen_como_decimales(self):
        """La planilla mezcla "1.502,25" con "1502.25" en la misma columna."""
        self.assertEqual(indices._numero("1.502,25"), 1502.25)
        self.assertEqual(indices._numero("1502.25"), 1502.25)
        self.assertEqual(indices._numero("1,0427"), 1.0427)
        self.assertIsNone(indices._numero(""))


class TestLaCuentaDelArticulo15(unittest.TestCase):
    """El coeficiente es la MENOR entre la variacion del IPC y la de la URA en doce meses,
    tomando el mes previo contra el mismo mes del ano anterior."""

    def setUp(self):
        self.series = indices.series_planilla(leer_bytes("indices_mef.ods"))

    def test_da_lo_mismo_que_publica_caja_notarial(self):
        # Junio 2026 sale del IPC de mayo 2026 contra el de mayo 2025.
        self.assertAlmostEqual(indices.recalcular(self.series, 2026, 6), 1.0377, places=4)
        self.assertAlmostEqual(indices.recalcular(self.series, 2026, 5), 1.0316, places=4)
        self.assertAlmostEqual(indices.recalcular(self.series, 2025, 12), 1.0409, places=4)

    def test_no_es_el_mes_corriente_sino_el_previo(self):
        """Si tomara el propio mes daria otro numero. Este test es el que atrapa el error
        que tiene la planilla del MEF."""
        con_el_mes_previo = indices.recalcular(self.series, 2026, 6)
        self.assertAlmostEqual(con_el_mes_previo, 1.0377, places=4)
        self.assertNotAlmostEqual(con_el_mes_previo, 1.0425, places=4)

    def test_sin_datos_devuelve_nada_en_vez_de_medio_numero(self):
        # El IPC crudo del MEF llega hasta mayo, asi que julio no se puede recalcular.
        self.assertIsNone(indices.recalcular(self.series, 2026, 7))
        self.assertIsNone(indices.recalcular({}, 2026, 6))

    def test_mes_anterior_cruza_bien_el_cambio_de_ano(self):
        self.assertEqual(indices.mes_anterior(2026, 1, 1), (2025, 12))
        self.assertEqual(indices.mes_anterior(2026, 6, 13), (2025, 5))
        self.assertEqual(indices.mes_anterior(2026, 3, 12), (2025, 3))


class TestElControl(unittest.TestCase):
    """La regla de oro: el coeficiente es el menor entre el IPC y la URA, asi que NUNCA
    puede superar al IPC. Es una linea de codigo y atrapa el error que tiene la fuente
    oficial."""

    def test_un_mes_sano_no_tiene_avisos(self):
        self.assertEqual(indices.revisar(1.0427, 1.0427, 1.0427), [])
        self.assertEqual(indices.revisar(1.0377, 1.0425, None), [])

    def test_atrapa_el_coeficiente_corrido_del_mef(self):
        """En junio de 2026 el MEF publica 1,0425 donde va 1,0377."""
        avisos = indices.revisar(1.0425, 1.0425, 1.0377)
        self.assertEqual(len(avisos), 1)
        self.assertIn("articulo 15", avisos[0])

    def test_un_coeficiente_mayor_que_el_ipc_es_imposible(self):
        avisos = indices.revisar(1.0500, 1.0427)
        self.assertEqual(len(avisos), 1)
        self.assertIn("nunca puede", avisos[0])

    def test_el_redondeo_del_cuarto_decimal_no_es_un_desacuerdo(self):
        """Febrero y abril de 2026 difieren en 0,0001 entre lo publicado y la cuenta, y
        estan bien los dos: el IPC crudo viene con dos decimales."""
        self.assertEqual(indices.revisar(1.0346, 1.0427, 1.0345), [])
        self.assertEqual(indices.revisar(1.0294, 1.0427, 1.0295), [])

    def test_pero_un_desvio_de_verdad_no_pasa(self):
        """El mes corrido del MEF se va 0,0048: treinta veces el ruido del redondeo."""
        self.assertTrue(indices.revisar(1.0425, 1.0427, 1.0377))

    def test_sin_coeficiente_lo_dice(self):
        self.assertEqual(indices.revisar(None, 1.0427), ["falta el coeficiente"])


class TestLoQueSeGuarda(unittest.TestCase):
    def setUp(self):
        self.series = indices.series_planilla(leer_bytes("indices_mef.ods"))
        self.publicados = indices.coeficientes_publicados(leer("indices_caja.html"))

    def test_arma_un_renglon_por_mes_con_los_dos_numeros(self):
        datos = indices.armar(self.publicados, {"2026-08": 1.0427}, self.series, "2026-08-18")
        agosto = datos["meses"]["2026-08"]
        self.assertEqual(agosto["coeficiente"], 1.0427)
        self.assertEqual(agosto["ipc"], 1.0427)
        self.assertTrue(agosto["verificado"])
        self.assertEqual(datos["actualizado"], "2026-08-18")

    def test_los_meses_reales_pasan_el_control(self):
        """Con los datos de verdad de agosto de 2026, ningun mes deberia quedar marcado."""
        datos = indices.armar(self.publicados, {}, self.series, "2026-08-18")
        con_problemas = {m: d["avisos"] for m, d in datos["meses"].items() if d["avisos"]}
        self.assertEqual(con_problemas, {})

    def test_un_mes_dudoso_igual_se_guarda_para_poder_avisar(self):
        datos = indices.armar({"2026-09": 1.0600}, {"2026-09": 1.0400}, {}, "2026-09-10")
        setiembre = datos["meses"]["2026-09"]
        self.assertFalse(setiembre["verificado"])
        self.assertEqual(setiembre["coeficiente"], 1.06)
        self.assertTrue(setiembre["avisos"])


if __name__ == "__main__":
    unittest.main()
