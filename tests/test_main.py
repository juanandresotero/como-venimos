import json
import pathlib
import tempfile
import unittest
from unittest import mock

from robot import almacen, main

LISTING = {
    "id": 1,
    "entityId": "e1",
    "internalId": "940041154-1",
    "title": "Casa linda",
    "slug": "casa-linda",
    "operation": {"value": "sale"},
    "type": {"value": "casa"},
    "currency": {"value": "USD"},
    "expensesCurrency": {"value": "UYU"},
    "expensesPrice": None,
    "listingStatus": {"value": "active"},
    "price": 100000.0,
    "displayAddress": "Calle Falsa 100",
    "geoLabel": "Cerrito, Cerrito, Montevideo",
    "location": {"coordinates": [-56.1, -34.8]},
    "dimensionLand": 300,
    "dimensionTotalBuilt": 300,
    "dimensionCovered": 120,
    "bedrooms": 3,
    "bathrooms": 1,
    "totalRooms": 5,
    "photos": [],
}


class TestMain(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.carpeta = pathlib.Path(self.tmp.name)
        self.parche_datos = mock.patch.object(almacen, "DATOS", self.carpeta)
        self.parche_datos.start()

    def tearDown(self):
        self.parche_datos.stop()
        self.tmp.cleanup()

    def leer(self, nombre):
        with open(self.carpeta / nombre, encoding="utf-8") as archivo:
            return json.load(archivo)

    def correr(self, listings, fecha="2026-08-18", entorno=None):
        base = {"FECHA_HOY": fecha}
        base.update(entorno or {})
        with mock.patch.object(main.api, "traer_listings", return_value=listings), \
             mock.patch.dict("os.environ", base, clear=False):
            return main.main()

    def test_una_corrida_normal_escribe_los_tres_archivos(self):
        self.assertEqual(self.correr([LISTING]), 0)
        self.assertEqual(len(self.leer("cartera.json")), 1)
        self.assertEqual(len(self.leer("eventos.json")), 1)
        estado = self.leer("estado_robot.json")
        self.assertTrue(estado["ok"])
        self.assertEqual(estado["ultima_corrida"], "2026-08-18")
        self.assertEqual(estado["propiedades"], 1)

    def test_los_eventos_se_acumulan_no_se_pisan(self):
        self.correr([LISTING], fecha="2026-08-18")
        caro = dict(LISTING, price=90000.0)
        self.correr([caro], fecha="2026-08-19")
        eventos = self.leer("eventos.json")
        self.assertEqual([e["tipo"] for e in eventos], ["carga_inicial", "cambio_precio"])

    def test_dry_run_no_escribe_nada(self):
        self.assertEqual(self.correr([LISTING], entorno={"DRY_RUN": "1"}), 0)
        self.assertFalse((self.carpeta / "cartera.json").exists())

    def test_si_la_api_falla_devuelve_error_y_lo_deja_anotado(self):
        with mock.patch.object(main.api, "traer_listings", side_effect=RuntimeError("se cayo")), \
             mock.patch.dict("os.environ", {"FECHA_HOY": "2026-08-18"}, clear=False):
            self.assertEqual(main.main(), 1)
        estado = self.leer("estado_robot.json")
        self.assertFalse(estado["ok"])
        self.assertIn("se cayo", estado["error"])

    def test_si_la_api_falla_no_da_de_baja_toda_la_cartera(self):
        # Lo peor que podria pasar: que un error de red se interprete como que se vendio todo.
        self.correr([LISTING], fecha="2026-08-18")
        with mock.patch.object(main.api, "traer_listings", side_effect=RuntimeError("se cayo")), \
             mock.patch.dict("os.environ", {"FECHA_HOY": "2026-08-19"}, clear=False):
            main.main()
        self.assertTrue(self.leer("cartera.json")["e1"]["activa"])


if __name__ == "__main__":
    unittest.main()
