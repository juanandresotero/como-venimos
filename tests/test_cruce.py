import unittest

from negocios import cruce


class TestPartirDireccion(unittest.TestCase):
    def test_calle_y_numero(self):
        self.assertEqual(cruce.partir_direccion("Gobernador Vigodet 2700"),
                         ("gobernador vigodet", 2700))

    def test_saca_los_acentos(self):
        self.assertEqual(cruce.partir_direccion("Flammarión 5000"), ("flammarion", 5000))

    def test_pasa_a_minusculas_y_saca_espacios_de_mas(self):
        self.assertEqual(cruce.partir_direccion("  GUTENBERG   6100 "), ("gutenberg", 6100))

    def test_ignora_lo_que_viene_despues_del_numero(self):
        self.assertEqual(cruce.partir_direccion("Bartolome mitre 1475 -Garaje"),
                         ("bartolome mitre", 1475))

    def test_sin_numero_devuelve_none(self):
        self.assertEqual(cruce.partir_direccion("Complejo america"), ("complejo america", None))

    def test_vacio_no_revienta(self):
        self.assertEqual(cruce.partir_direccion(None), ("", None))
        self.assertEqual(cruce.partir_direccion(""), ("", None))


class TestBloque(unittest.TestCase):
    def test_redondea_a_la_centena_de_abajo(self):
        # RE/MAX publica la direccion redondeada: el 3959 aparece como 3900.
        self.assertEqual(cruce.bloque(3959), 3900)
        self.assertEqual(cruce.bloque(3900), 3900)
        self.assertEqual(cruce.bloque(1254), 1200)
        self.assertEqual(cruce.bloque(1200), 1200)

    def test_sin_numero_devuelve_none(self):
        self.assertIsNone(cruce.bloque(None))


class TestMismaCalle(unittest.TestCase):
    def test_identicas(self):
        self.assertTrue(cruce.misma_calle("gutenberg", "gutenberg"))

    def test_tolera_errores_de_tipeo(self):
        # Casos reales del Excel del usuario, con su parecido medido:
        self.assertTrue(cruce.misma_calle("flamarrion", "flammarion"))              # 0.900
        self.assertTrue(cruce.misma_calle("juana de ibarburu", "juana de ibarbourou"))  # 0.944
        self.assertTrue(cruce.misma_calle("ovidio fernandes", "ovidio fernandez rios"))  # 0.865

    def test_calles_distintas_no_matchean(self):
        self.assertFalse(cruce.misma_calle("gutenberg", "minas"))                   # 0.143
        self.assertFalse(cruce.misma_calle("picaflores", "gobernador vigodet"))

    def test_no_confunde_barrios_parecidos(self):
        # El error que tuvo el cruce a ojo: "Punta" hacia matchear tres barrios distintos.
        self.assertFalse(cruce.misma_calle("punta del este", "punta carretas"))     # 0.571

    def test_vacias_no_matchean(self):
        self.assertFalse(cruce.misma_calle("", "gutenberg"))
        self.assertFalse(cruce.misma_calle("gutenberg", ""))


CARTERA = {
    "prop-reducto": {
        "entity_id": "prop-reducto",
        "direccion": "San Fructuoso 1200",
        "precio": 89900.0,
        "estado": "reservada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-malvin": {
        "entity_id": "prop-malvin",
        "direccion": "Flammarión 5000",
        "precio": 60000.0,
        "estado": "en_negociacion",
        "activa": True,
        "operacion": "venta",
    },
    "prop-colon": {
        "entity_id": "prop-colon",
        "direccion": "Gutenberg 6100",
        "precio": 490000.0,
        "estado": "publicada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-vieja": {
        "entity_id": "prop-vieja",
        "direccion": "Minas 1600",
        "precio": 165000.0,
        "estado": "publicada",
        "activa": False,          # ya se dio de baja
        "operacion": "venta",
    },
}


class TestEmparejar(unittest.TestCase):
    def test_calle_bloque_y_precio_dan_confianza_alta(self):
        # Caso real: fila 82 del Excel contra la propiedad reservada de Reducto.
        r = cruce.emparejar("San fructuoso 1254", 89900.0, CARTERA)
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]["entity_id"], "prop-reducto")
        self.assertEqual(r[0]["confianza"], "alta")

    def test_tolera_el_error_de_tipeo_en_la_calle(self):
        # Caso real: fila 66, "flamarrion 5046" contra "Flammarión 5000".
        r = cruce.emparejar("flamarrion 5046", 58500.0, CARTERA)
        self.assertEqual(r[0]["entity_id"], "prop-malvin")
        self.assertEqual(r[0]["confianza"], "alta")

    def test_calle_y_bloque_sin_precio_parecido_dan_confianza_media(self):
        r = cruce.emparejar("Gutenberg 6155", 200000.0, CARTERA)
        self.assertEqual(r[0]["entity_id"], "prop-colon")
        self.assertEqual(r[0]["confianza"], "media")

    def test_calle_distinta_no_empareja_aunque_el_precio_coincida(self):
        # Esto es lo que rompia el cruce a ojo: el precio solo no alcanza.
        self.assertEqual(cruce.emparejar("Otra calle 100", 89900.0, CARTERA), [])

    def test_bloque_distinto_baja_la_confianza_pero_no_descarta(self):
        r = cruce.emparejar("San fructuoso 3400", 89900.0, CARTERA)
        self.assertEqual(r[0]["confianza"], "media")

    def test_no_empareja_contra_propiedades_dadas_de_baja(self):
        self.assertEqual(cruce.emparejar("Minas 1600", 165000.0, CARTERA), [])

    def test_sin_direccion_no_empareja(self):
        self.assertEqual(cruce.emparejar(None, 89900.0, CARTERA), [])
        self.assertEqual(cruce.emparejar("", 89900.0, CARTERA), [])

    def test_devuelve_los_motivos_para_mostrarselos_al_usuario(self):
        r = cruce.emparejar("San fructuoso 1254", 89900.0, CARTERA)
        self.assertIn("misma calle", r[0]["motivos"])
        self.assertIn("misma altura", r[0]["motivos"])
        self.assertIn("precio parecido", r[0]["motivos"])

    def test_ordena_primero_las_de_mayor_confianza(self):
        cartera = dict(CARTERA)
        cartera["otra-fructuoso"] = {
            "entity_id": "otra-fructuoso",
            "direccion": "San Fructuoso 4400",
            "precio": 20000.0,
            "estado": "publicada",
            "activa": True,
            "operacion": "venta",
        }
        r = cruce.emparejar("San fructuoso 1254", 89900.0, cartera)
        self.assertEqual(r[0]["confianza"], "alta")
        self.assertEqual(r[0]["entity_id"], "prop-reducto")


if __name__ == "__main__":
    unittest.main()
