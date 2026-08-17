import pathlib
import tempfile
import unittest

from robot import almacen


class TestAlmacen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.carpeta = pathlib.Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_leer_devuelve_el_default_si_no_existe(self):
        self.assertEqual(almacen.leer_json("nada.json", {}, self.carpeta), {})
        self.assertEqual(almacen.leer_json("nada.json", [], self.carpeta), [])

    def test_escribir_y_volver_a_leer(self):
        datos = {"a": 1, "b": [1, 2, 3]}
        almacen.escribir_json("prueba.json", datos, self.carpeta)
        self.assertEqual(almacen.leer_json("prueba.json", None, self.carpeta), datos)

    def test_guarda_los_acentos_legibles(self):
        almacen.escribir_json("acentos.json", {"barrio": "Maroñas"}, self.carpeta)
        texto = (self.carpeta / "acentos.json").read_text(encoding="utf-8")
        self.assertIn("Maroñas", texto)

    def test_no_deja_archivos_temporales(self):
        almacen.escribir_json("prueba.json", {"a": 1}, self.carpeta)
        sobrantes = [p.name for p in self.carpeta.iterdir() if p.name.endswith(".tmp")]
        self.assertEqual(sobrantes, [])

    def test_crea_la_carpeta_si_no_existe(self):
        destino = self.carpeta / "nueva" / "subcarpeta"
        almacen.escribir_json("x.json", {"ok": True}, destino)
        self.assertTrue((destino / "x.json").exists())

    def test_escribe_ordenado_para_que_el_diff_de_git_sea_limpio(self):
        almacen.escribir_json("orden.json", {"z": 1, "a": 2}, self.carpeta)
        texto = (self.carpeta / "orden.json").read_text(encoding="utf-8")
        self.assertLess(texto.index('"a"'), texto.index('"z"'))


if __name__ == "__main__":
    unittest.main()
