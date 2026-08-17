import unittest
from unittest import mock

from robot import api


def respuesta(listings, total=None):
    return {"data": {"data": listings, "totalItems": total if total is not None else len(listings)}}


def respuesta_http(cuerpo: bytes):
    """Imita lo que devuelve urlopen: un context manager con .read()."""
    contexto = mock.MagicMock()
    contexto.__enter__.return_value.read.return_value = cuerpo
    contexto.__exit__.return_value = False
    return contexto


class TestTraerListings(unittest.TestCase):
    def test_devuelve_la_lista_de_propiedades(self):
        with mock.patch.object(api, "bajar", return_value=respuesta([{"id": 1}, {"id": 2}])):
            self.assertEqual(api.traer_listings(), [{"id": 1}, {"id": 2}])

    def test_cartera_vacia_no_revienta(self):
        with mock.patch.object(api, "bajar", return_value=respuesta([])):
            self.assertEqual(api.traer_listings(), [])

    def test_respuesta_rara_devuelve_lista_vacia(self):
        with mock.patch.object(api, "bajar", return_value={}):
            self.assertEqual(api.traer_listings(), [])

    def test_falla_si_la_api_dice_que_hay_mas_de_las_que_mando(self):
        # Proteccion contra paginado silencioso: si algun dia tiene mas de 200 propiedades,
        # preferimos que reviente antes que grabar una cartera incompleta y dar de baja
        # propiedades que en realidad estan vivas.
        with mock.patch.object(api, "bajar", return_value=respuesta([{"id": 1}], total=250)):
            with self.assertRaises(RuntimeError) as caso:
                api.traer_listings()
        self.assertIn("250", str(caso.exception))


class TestBajar(unittest.TestCase):
    def test_reintenta_y_termina_bien(self):
        intentos = []

        def falla_la_primera(pedido, timeout=None):
            intentos.append(1)
            if len(intentos) == 1:
                raise TimeoutError("se colgo")
            return respuesta_http(b'{"ok": true}')

        with mock.patch("urllib.request.urlopen", side_effect=falla_la_primera), \
             mock.patch("time.sleep"):
            self.assertEqual(api.bajar(intentos=3, espera=0), {"ok": True})
        self.assertEqual(len(intentos), 2)

    def test_json_roto_tambien_reintenta(self):
        # Un JSON cortado a la mitad tiene que reintentarse igual que un corte de red.
        respuestas = [respuesta_http(b'{"ok": tru'), respuesta_http(b'{"ok": true}')]
        with mock.patch("urllib.request.urlopen", side_effect=respuestas), \
             mock.patch("time.sleep"):
            self.assertEqual(api.bajar(intentos=3, espera=0), {"ok": True})

    def test_si_falla_siempre_avisa_con_un_error_claro(self):
        with mock.patch("urllib.request.urlopen", side_effect=TimeoutError("se colgo")), \
             mock.patch("time.sleep"):
            with self.assertRaises(RuntimeError) as caso:
                api.bajar(intentos=2, espera=0)
        self.assertIn("2 intentos", str(caso.exception))


if __name__ == "__main__":
    unittest.main()
