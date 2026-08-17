import unittest

from robot import procesar

HOY = "2026-08-18"
AYER = "2026-08-17"


def propiedad(entity_id="e1", precio=100000.0, estado="publicada", direccion="Calle Falsa 100"):
    """Una propiedad ya normalizada, como la deja robot.modelo."""
    return {
        "entity_id": entity_id,
        "internal_id": "940041154-1",
        "listing_id": 1,
        "titulo": "Casa linda",
        "slug": "casa-linda",
        "link": "https://www.remax.com.uy/listings/casa-linda",
        "operacion": "venta",
        "tipo": "casa",
        "precio": precio,
        "moneda": "USD",
        "gastos_comunes": None,
        "moneda_gastos": "UYU",
        "direccion": direccion,
        "barrio": "Cerrito",
        "lat": -34.8,
        "lon": -56.1,
        "m2_terreno": 300,
        "m2_total": 300,
        "m2_cubierto": 120,
        "dormitorios": 3,
        "banos": 1,
        "ambientes": 5,
        "estado": estado,
        "foto_portada": None,
    }


def tipos(eventos):
    return [e["tipo"] for e in eventos]


class TestAltas(unittest.TestCase):
    def test_la_primera_corrida_marca_carga_inicial_y_no_altas(self):
        # La primera vez todas las propiedades son "nuevas" para el robot, pero no son
        # nuevas para el usuario: las tiene publicadas hace meses. Se avisan distinto.
        cartera, eventos = procesar.procesar({}, [propiedad("e1"), propiedad("e2")], HOY)
        self.assertEqual(len(cartera), 2)
        self.assertEqual(tipos(eventos), ["carga_inicial", "carga_inicial"])

    def test_una_propiedad_nueva_sobre_cartera_existente_es_un_alta(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1"), propiedad("e2")], HOY)
        self.assertEqual(tipos(eventos), ["alta"])
        self.assertEqual(eventos[0]["entity_id"], "e2")

    def test_el_alta_guarda_las_fechas_y_el_historial_de_precio(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["visto_primera_vez"], HOY)
        self.assertEqual(fila["visto_ultima_vez"], HOY)
        self.assertTrue(fila["activa"])
        self.assertEqual(
            fila["historial_precio"],
            [{"fecha": HOY, "precio": 240000.0, "moneda": "USD"}],
        )

    def test_el_alta_deja_los_campos_del_usuario_vacios_y_listos_para_llenar(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY)
        fila = cartera["e1"]
        self.assertIsNone(fila["origen_captacion"])
        self.assertIsNone(fila["desenlace_confirmado"])
        self.assertEqual(fila["notas"], "")
        self.assertTrue(fila["usar_en_proyeccion"])

    def test_la_fecha_de_captacion_arranca_igual_a_la_primera_vez_vista(self):
        # Es una estimacion: el usuario la corrige a mano si la tenia publicada de antes.
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY)
        self.assertEqual(cartera["e1"]["fecha_captacion_real"], HOY)
        self.assertTrue(cartera["e1"]["fecha_captacion_estimada"])

    def test_si_nace_en_negociacion_o_reservada_se_anota_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], HOY)
        self.assertEqual(cartera["e1"]["fecha_negociacion"], HOY)
        cartera, _ = procesar.procesar({}, [propiedad("e2", estado="reservada")], HOY)
        self.assertEqual(cartera["e2"]["fecha_reservada"], HOY)

    def test_no_modifica_la_cartera_que_recibe(self):
        original = {}
        procesar.procesar(original, [propiedad("e1")], HOY)
        self.assertEqual(original, {})


class TestCambioDePrecio(unittest.TestCase):
    def test_baja_de_precio_genera_evento_y_se_suma_al_historial(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1", precio=225000.0)], HOY)

        self.assertEqual(tipos(eventos), ["cambio_precio"])
        self.assertEqual(eventos[0]["detalle"], {
            "antes": 240000.0, "ahora": 225000.0, "moneda": "USD",
        })
        self.assertEqual(cartera["e1"]["historial_precio"], [
            {"fecha": AYER, "precio": 240000.0, "moneda": "USD"},
            {"fecha": HOY, "precio": 225000.0, "moneda": "USD"},
        ])

    def test_el_precio_actual_queda_actualizado(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", precio=225000.0)], HOY)
        self.assertEqual(cartera["e1"]["precio"], 225000.0)

    def test_mismo_precio_no_genera_nada(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=240000.0)], AYER)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1", precio=240000.0)], HOY)
        self.assertEqual(eventos, [])
        self.assertEqual(len(cartera["e1"]["historial_precio"]), 1)

    def test_se_actualiza_la_fecha_de_ultima_vez_vista(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1")], HOY)
        self.assertEqual(cartera["e1"]["visto_primera_vez"], AYER)
        self.assertEqual(cartera["e1"]["visto_ultima_vez"], HOY)


class TestCambioDeEstado(unittest.TestCase):
    def test_pasar_a_negociacion_avisa_y_anota_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, eventos = procesar.procesar(
            cartera, [propiedad("e1", estado="en_negociacion")], HOY
        )
        self.assertEqual(tipos(eventos), ["cambio_estado"])
        self.assertEqual(eventos[0]["detalle"], {"antes": "publicada", "ahora": "en_negociacion"})
        self.assertEqual(cartera["e1"]["fecha_negociacion"], HOY)

    def test_pasar_a_reservada_anota_su_propia_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", estado="reservada")], HOY)
        self.assertEqual(cartera["e1"]["fecha_negociacion"], AYER)
        self.assertEqual(cartera["e1"]["fecha_reservada"], HOY)

    def test_la_fecha_de_negociacion_guarda_la_primera_vez_no_la_ultima(self):
        # Si va y vuelve de negociacion, nos interesa cuando entro por primera vez.
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", estado="publicada")], HOY)
        cartera, _ = procesar.procesar(
            cartera, [propiedad("e1", estado="en_negociacion")], "2026-08-19"
        )
        self.assertEqual(cartera["e1"]["fecha_negociacion"], AYER)

    def test_precio_y_estado_cambian_juntos_generan_dos_eventos(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=100000.0)], AYER)
        cartera, eventos = procesar.procesar(
            cartera, [propiedad("e1", precio=90000.0, estado="en_negociacion")], HOY
        )
        self.assertEqual(sorted(tipos(eventos)), ["cambio_estado", "cambio_precio"])


if __name__ == "__main__":
    unittest.main()
