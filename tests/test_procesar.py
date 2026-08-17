import unittest

from robot import procesar

HOY = "2026-08-18"
AYER = "2026-08-17"


def propiedad(entity_id="e1", precio=100000.0, estado="publicada", direccion=None):
    """Una propiedad ya normalizada, como la deja robot.modelo.

    Si no se pide una direccion concreta, cada propiedad recibe la suya. Dos propiedades
    distintas con la MISMA direccion y el MISMO precio son, justamente, lo que el detector
    de duplicados marca — y eso se prueba aparte en TestDuplicados.
    """
    direccion = direccion or f"Calle Falsa {entity_id}"
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


class TestBajas(unittest.TestCase):
    def test_desaparecer_estando_reservada_propone_vendida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="reservada")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)

        self.assertEqual(tipos(eventos), ["baja"])
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "vendida")
        self.assertEqual(eventos[0]["detalle"]["estado_al_desaparecer"], "reservada")

    def test_desaparecer_estando_publicada_propone_caida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "caida")

    def test_desaparecer_estando_en_negociacion_propone_caida(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="en_negociacion")], AYER)
        cartera, eventos = procesar.procesar(cartera, [], HOY)
        self.assertEqual(eventos[0]["detalle"]["desenlace_propuesto"], "caida")

    def test_la_baja_marca_la_fila_y_guarda_la_fecha(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="reservada")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        fila = cartera["e1"]
        self.assertFalse(fila["activa"])
        self.assertEqual(fila["fecha_desaparicion"], HOY)
        self.assertEqual(fila["estado_al_desaparecer"], "reservada")
        self.assertEqual(fila["desenlace_propuesto"], "vendida")

    def test_no_avisa_dos_veces_por_la_misma_baja(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, eventos = procesar.procesar(cartera, [], "2026-08-19")
        self.assertEqual(eventos, [])

    def test_la_propiedad_dada_de_baja_no_se_borra(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        self.assertIn("e1", cartera)

    def test_si_reaparece_se_limpia_la_baja_y_avisa(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, eventos = procesar.procesar(cartera, [propiedad("e1")], "2026-08-19")

        self.assertIn("reaparecio", tipos(eventos))
        fila = cartera["e1"]
        self.assertTrue(fila["activa"])
        self.assertIsNone(fila["fecha_desaparicion"])
        self.assertIsNone(fila["desenlace_propuesto"])


class TestCamposDelUsuario(unittest.TestCase):
    def _cartera_con_datos_cargados_a_mano(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=100000.0)], AYER)
        cartera["e1"].update({
            "fecha_captacion_real": "2025-03-01",
            "fecha_captacion_estimada": False,
            "origen_captacion": "BDR",
            "desenlace_confirmado": None,
            "usar_en_proyeccion": False,
            "notas": "El dueño viaja en enero",
        })
        return cartera

    def test_una_corrida_normal_no_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [propiedad("e1", precio=90000.0)], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["fecha_captacion_real"], "2025-03-01")
        self.assertFalse(fila["fecha_captacion_estimada"])
        self.assertEqual(fila["origen_captacion"], "BDR")
        self.assertFalse(fila["usar_en_proyeccion"])
        self.assertEqual(fila["notas"], "El dueño viaja en enero")
        # ...y el dato del robot si se actualizo
        self.assertEqual(fila["precio"], 90000.0)

    def test_una_baja_tampoco_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [], HOY)
        fila = cartera["e1"]
        self.assertEqual(fila["origen_captacion"], "BDR")
        self.assertEqual(fila["notas"], "El dueño viaja en enero")
        self.assertEqual(fila["fecha_captacion_real"], "2025-03-01")

    def test_una_reaparicion_tampoco_pisa_nada_del_usuario(self):
        cartera = self._cartera_con_datos_cargados_a_mano()
        cartera, _ = procesar.procesar(cartera, [], HOY)
        cartera, _ = procesar.procesar(cartera, [propiedad("e1")], "2026-08-19")
        self.assertEqual(cartera["e1"]["origen_captacion"], "BDR")
        self.assertEqual(cartera["e1"]["notas"], "El dueño viaja en enero")

    def test_el_desenlace_confirmado_por_el_usuario_le_gana_al_propuesto(self):
        cartera, _ = procesar.procesar({}, [propiedad("e1", estado="publicada")], AYER)
        cartera, _ = procesar.procesar(cartera, [], HOY)
        # El robot propuso "caida"; el usuario dice que en realidad se vendio.
        cartera["e1"]["desenlace_confirmado"] = "vendida"
        cartera, _ = procesar.procesar(cartera, [], "2026-08-19")
        self.assertEqual(cartera["e1"]["desenlace_confirmado"], "vendida")
        self.assertEqual(cartera["e1"]["desenlace_propuesto"], "caida")

    def test_ningun_campo_del_usuario_aparece_en_lo_que_produce_el_modelo(self):
        # Garantia estructural: si robot.modelo devolviera alguno de estos campos,
        # fila.update(prop) lo pisaria. Este test lo impide para siempre.
        campos_del_modelo = set(propiedad().keys())
        for campo in procesar.CAMPOS_DEL_USUARIO:
            self.assertNotIn(campo, campos_del_modelo)


class TestDuplicados(unittest.TestCase):
    def _dos_iguales(self):
        return [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="Gutenberg 6100"),
        ]

    def test_misma_direccion_y_mismo_precio_avisa(self):
        cartera, eventos = procesar.procesar({}, self._dos_iguales(), HOY)
        duplicados = [e for e in eventos if e["tipo"] == "posible_duplicado"]
        self.assertEqual(len(duplicados), 1)
        self.assertEqual(duplicados[0]["entity_id"], "e2")
        self.assertEqual(duplicados[0]["detalle"]["duplicado_de"], "e1")

    def test_el_duplicado_queda_fuera_de_la_proyeccion_por_defecto(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), HOY)
        self.assertTrue(cartera["e1"]["usar_en_proyeccion"])
        self.assertFalse(cartera["e2"]["usar_en_proyeccion"])
        self.assertEqual(cartera["e2"]["posible_duplicado_de"], "e1")

    def test_no_avisa_de_nuevo_al_dia_siguiente(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), AYER)
        cartera, eventos = procesar.procesar(cartera, self._dos_iguales(), HOY)
        self.assertEqual([e for e in eventos if e["tipo"] == "posible_duplicado"], [])

    def test_si_el_usuario_dijo_que_no_es_duplicado_se_respeta(self):
        cartera, _ = procesar.procesar({}, self._dos_iguales(), AYER)
        cartera["e2"]["usar_en_proyeccion"] = True   # el usuario lo volvio a prender
        cartera, _ = procesar.procesar(cartera, self._dos_iguales(), HOY)
        self.assertTrue(cartera["e2"]["usar_en_proyeccion"])

    def test_direcciones_distintas_no_son_duplicado(self):
        propiedades = [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="Otra calle 200"),
        ]
        _, eventos = procesar.procesar({}, propiedades, HOY)
        self.assertEqual([e for e in eventos if e["tipo"] == "posible_duplicado"], [])

    def test_mayusculas_y_espacios_no_impiden_detectarlo(self):
        propiedades = [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="  GUTENBERG 6100 "),
        ]
        _, eventos = procesar.procesar({}, propiedades, HOY)
        self.assertEqual(len([e for e in eventos if e["tipo"] == "posible_duplicado"]), 1)


class TestOverlayDelUsuario(unittest.TestCase):
    """La app no escribe cartera.json: anota en mis_datos.json y el robot lo respeta (§3.3)."""

    def test_lo_anotado_por_el_usuario_se_aplica_sobre_la_cartera(self):
        mis_datos = {"cartera": {"e1": {"origen_captacion": "BDR",
                                        "fecha_captacion_real": "2026-03-01",
                                        "fecha_captacion_estimada": False}}}
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY, mis_datos)
        self.assertEqual(cartera["e1"]["origen_captacion"], "BDR")
        self.assertEqual(cartera["e1"]["fecha_captacion_real"], "2026-03-01")
        self.assertFalse(cartera["e1"]["fecha_captacion_estimada"])

    def test_los_datos_del_robot_no_se_tocan(self):
        mis_datos = {"cartera": {"e1": {"notas": "hablar con el dueño"}}}
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=123456.0)], HOY, mis_datos)
        self.assertEqual(cartera["e1"]["precio"], 123456.0)
        self.assertEqual(cartera["e1"]["notas"], "hablar con el dueño")

    def test_el_overlay_no_puede_escribir_campos_que_son_del_robot(self):
        mis_datos = {"cartera": {"e1": {"precio": 1, "estado": "reservada"}}}
        cartera, _ = procesar.procesar({}, [propiedad("e1", precio=100000.0)], HOY, mis_datos)
        self.assertEqual(cartera["e1"]["precio"], 100000.0)
        self.assertEqual(cartera["e1"]["estado"], "publicada")

    def test_una_anotacion_de_una_propiedad_que_ya_no_existe_no_rompe(self):
        mis_datos = {"cartera": {"fantasma": {"notas": "vieja"}}}
        cartera, _ = procesar.procesar({}, [propiedad("e1")], HOY, mis_datos)
        self.assertEqual(list(cartera), ["e1"])

    def test_el_usuario_puede_volver_a_incluir_un_duplicado_en_la_proyeccion(self):
        # El detector apaga usar_en_proyeccion; el usuario dice que no son la misma.
        propiedades = [
            propiedad("e1", precio=490000.0, direccion="Gutenberg 6100"),
            propiedad("e2", precio=490000.0, direccion="Gutenberg 6100"),
        ]
        sin_overlay, _ = procesar.procesar({}, propiedades, HOY)
        self.assertFalse(sin_overlay["e2"]["usar_en_proyeccion"])

        mis_datos = {"cartera": {"e2": {"usar_en_proyeccion": True}}}
        con_overlay, _ = procesar.procesar({}, propiedades, HOY, mis_datos)
        self.assertTrue(con_overlay["e2"]["usar_en_proyeccion"])

    def test_sin_mis_datos_todo_sigue_funcionando_igual(self):
        cartera, eventos = procesar.procesar({}, [propiedad("e1")], HOY)
        self.assertTrue(cartera["e1"]["usar_en_proyeccion"])
        self.assertEqual(len(eventos), 1)


if __name__ == "__main__":
    unittest.main()
