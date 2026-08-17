import unittest

from negocios import importador

AJUSTES = {
    "categorias": [
        {"categoria": "RAP", "split_pct": 0.45, "fee_mensual_usd": 70,
         "desde": "2026-01-01", "hasta": None},
    ],
    "defaults_comision": {
        "venta": {"1": 0.03, "2": 0.06},
        "alquiler": {"1": 1.0, "2": 2.0},
    },
    "regla_martin": {"facturacion": 0.5, "ganancia": 0.35},
    "pct_suplencia": 0.125,
    "pct_referido_saliente": 0.25,
    "pct_referido_entrante_otro": 0.75,
}

YO = "Juan Andrés Otero"


def fila(**cambios):
    base = {
        "fila_excel": 5,
        "operacion": "Venta",
        "barrio": "Solymar norte",
        "direccion": "Picaflores",
        "agente_vende": YO,
        "agente_compra": "Otro REMAX",
        "origen": "Bdr",
        "precio": 140000.0,
        "pct_comision": 0.03,
        "facturado": 4200.0,
        "pct_agente": 0.5,
        "importe": 2100.0,
        "fecha_inicio": "2022-09-17",
        "fecha_boleto": "2022-10-24",
        "fecha_fin": "2023-01-24",
    }
    base.update(cambios)
    return base


CARTERA_VIVA = {
    "prop-reducto": {
        "entity_id": "prop-reducto",
        "direccion": "San Fructuoso 1200",
        "precio": 89900.0,
        "estado": "reservada",
        "activa": True,
        "operacion": "venta",
    },
    "prop-cerrito": {
        "entity_id": "prop-cerrito",
        "direccion": "Estanislao Vega 3900",
        "precio": 43000.0,
        "estado": "en_negociacion",
        "activa": True,
        "operacion": "venta",
    },
}


class TestPuntas(unittest.TestCase):
    def test_ambos_agentes_soy_yo_son_dos_puntas(self):
        n = importador.traducir(fila(agente_vende=YO, agente_compra=YO), AJUSTES)
        self.assertEqual(n["puntas"], 2)

    def test_solo_vendedor_es_una_punta(self):
        n = importador.traducir(fila(agente_vende=YO, agente_compra="Otro REMAX"), AJUSTES)
        self.assertEqual(n["puntas"], 1)

    def test_solo_comprador_es_una_punta(self):
        n = importador.traducir(fila(agente_vende="Otro REMAX", agente_compra=YO), AJUSTES)
        self.assertEqual(n["puntas"], 1)

    def test_ninguno_soy_yo_son_cero_puntas(self):
        n = importador.traducir(fila(agente_vende="Otro REMAX", agente_compra="Otro REMAX"), AJUSTES)
        self.assertEqual(n["puntas"], 0)

    def test_agentes_vacios_son_cero_puntas_y_avisan(self):
        n = importador.traducir(fila(agente_vende=None, agente_compra=None), AJUSTES)
        self.assertEqual(n["puntas"], 0)
        self.assertIn("faltan_agentes", [a["tipo"] for a in n["avisos"]])


class TestRegimen(unittest.TestCase):
    def caso(self, origen):
        return importador.traducir(fila(origen=origen), AJUSTES)

    def test_bdr_redes_y_cliente_antiguo_son_captacion_propia(self):
        for origen in ("Bdr", "Redes Pago", "Cliente antiguo", "Ref. Bdr"):
            self.assertEqual(self.caso(origen)["regimen_comision"], "captacion_mia", origen)

    def test_ref_martin(self):
        self.assertEqual(self.caso("Ref. Martin")["regimen_comision"], "ref_martin")

    def test_ref_remax_team_y_clientes_son_de_otro_colega(self):
        for origen in ("Ref. Remax", "Ref. Team", "Ref. Clientes"):
            self.assertEqual(self.caso(origen)["regimen_comision"], "ref_otro_colega", origen)

    def test_guarda_el_origen_de_marketing_aparte_del_regimen(self):
        n = self.caso("Ref. Martin")
        self.assertEqual(n["origen_captacion"], "Referido - Martín")
        self.assertEqual(n["regimen_comision"], "ref_martin")

    def test_cero_puntas_con_captacion_propia_es_un_referido_saliente(self):
        # Si el negocio no es de nadie mio pero yo lo traje, se lo pase a un colega.
        n = importador.traducir(
            fila(agente_vende="Otro REMAX", agente_compra="Otro REMAX", origen="Bdr"), AJUSTES)
        self.assertEqual(n["regimen_comision"], "yo_referi")

    def test_origen_desconocido_avisa(self):
        n = self.caso("Otros")
        self.assertIn("origen_sin_clasificar", [a["tipo"] for a in n["avisos"]])

    def test_origen_vacio_avisa(self):
        n = self.caso(None)
        self.assertIn("origen_sin_clasificar", [a["tipo"] for a in n["avisos"]])


class TestCamposBasicos(unittest.TestCase):
    def test_el_id_dice_de_que_fila_del_excel_salio(self):
        self.assertEqual(importador.traducir(fila(fila_excel=37), AJUSTES)["id"], "excel-37")

    def test_traduce_el_tipo_de_negocio(self):
        self.assertEqual(importador.traducir(fila(operacion="Venta"), AJUSTES)["tipo_negocio"], "venta")
        self.assertEqual(importador.traducir(fila(operacion="Alquiler"), AJUSTES)["tipo_negocio"], "alquiler")

    def test_copia_direccion_barrio_precio_y_fechas(self):
        n = importador.traducir(fila(), AJUSTES)
        self.assertEqual(n["direccion"], "Picaflores")
        self.assertEqual(n["barrio"], "Solymar norte")
        self.assertEqual(n["precio_operacion"], 140000.0)
        self.assertEqual(n["fecha_inicio"], "2022-09-17")
        self.assertEqual(n["fecha_fin"], "2023-01-24")

    def test_la_moneda_es_dolares(self):
        # Todo el Excel esta en USD, incluidos los alquileres (un garaje a 90).
        self.assertEqual(importador.traducir(fila(), AJUSTES)["moneda"], "USD")

    def test_los_barrios_se_normalizan_en_mayusculas(self):
        # En el Excel conviven 'Cerrito' y 'cerrito', y eso inflaba la cuenta de barrios.
        a = importador.traducir(fila(barrio="Cerrito"), AJUSTES)["barrio"]
        b = importador.traducir(fila(barrio="cerrito"), AJUSTES)["barrio"]
        self.assertEqual(a, b)


class TestReglaDeCorte2026(unittest.TestCase):
    def test_antes_de_2026_respeta_los_numeros_del_excel(self):
        # RE/MAX cambio las reglas varias veces; recalcular el pasado lo deformaria.
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin="2023-01-24", facturado=4200.0, importe=2100.0), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 4200.0)
        self.assertEqual(n["ganancia"], 2100.0)
        self.assertFalse(n["recalculado"])

    def test_desde_2026_recalcula_con_el_motor_nuevo(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-03-15", precio=100000.0, pct_comision=0.03,
                     origen="Ref. Martin", facturado=3000.0, importe=1050.0), AJUSTES),
            AJUSTES)
        self.assertEqual(n["base"], 3000.0)
        self.assertEqual(n["facturacion"], 1500.0)
        self.assertEqual(n["ganancia"], 1050.0)
        self.assertTrue(n["recalculado"])
        self.assertEqual(n["categoria_vigente"], "RAP")

    def test_si_lo_recalculado_no_coincide_con_el_excel_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-03-15", precio=100000.0, pct_comision=0.03,
                     origen="Ref. Martin", facturado=3000.0, importe=1050.0), AJUSTES),
            AJUSTES)
        tipos = [a["tipo"] for a in n["avisos"]]
        self.assertIn("recalculo_distinto", tipos)
        aviso = [a for a in n["avisos"] if a["tipo"] == "recalculo_distinto"][0]
        self.assertIn("3,000", aviso["detalle"])
        self.assertIn("1,500", aviso["detalle"])

    def test_si_coincide_no_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(
                fila(fecha_fin="2026-02-05", precio=309000.0, pct_comision=0.03,
                     origen="Bdr", agente_vende=YO, agente_compra="Otro REMAX",
                     facturado=9270.0, importe=4171.5), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 9270.0)
        self.assertNotIn("recalculo_distinto", [a["tipo"] for a in n["avisos"]])

    def test_sin_fecha_de_firma_no_se_puede_saber_el_regimen_y_avisa(self):
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin=None), AJUSTES), AJUSTES)
        self.assertIn("sin_fecha_fin", [a["tipo"] for a in n["avisos"]])

    def test_la_base_se_calcula_siempre_aunque_no_se_recalcule(self):
        n = importador.calcular_plata(
            importador.traducir(fila(fecha_fin="2023-01-24", precio=140000.0, pct_comision=0.03), AJUSTES),
            AJUSTES)
        self.assertEqual(n["base"], 4200.0)


class TestAvisosDeAritmetica(unittest.TestCase):
    def test_avisa_si_precio_por_porcentaje_no_da_el_facturado(self):
        n = importador.calcular_plata(
            importador.traducir(fila(precio=109000.0, pct_comision=0.03, facturado=2772.96), AJUSTES),
            AJUSTES)
        self.assertIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])

    def test_no_avisa_por_diferencias_de_redondeo(self):
        n = importador.calcular_plata(
            importador.traducir(fila(precio=100000.0, pct_comision=0.03, facturado=3000.4), AJUSTES),
            AJUSTES)
        self.assertNotIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])

    def test_avisa_si_el_porcentaje_de_comision_es_absurdo(self):
        # Caso real: fila 51, 26,25 con formato de porcentaje se muestra como 2625%.
        n = importador.calcular_plata(
            importador.traducir(fila(pct_comision=26.25), AJUSTES), AJUSTES)
        self.assertIn("comision_absurda", [a["tipo"] for a in n["avisos"]])

    def test_un_alquiler_a_dos_meses_no_es_absurdo(self):
        n = importador.calcular_plata(
            importador.traducir(fila(operacion="Alquiler", precio=333.0, pct_comision=2.0,
                                     facturado=666.0), AJUSTES), AJUSTES)
        self.assertNotIn("comision_absurda", [a["tipo"] for a in n["avisos"]])


class TestSeparadorDecimalPerdido(unittest.TestCase):
    """Caso real fila 37: la celda guarda 770048 y el valor correcto es 770,048.

    Se distingue de un descuento real porque la diferencia es un factor EXACTO de 10, 100
    o 1000 — o sea, una coma que se perdio. Un descuento real difiere un 10 o 15%.
    """

    def test_corrige_solo_cuando_la_diferencia_es_por_mil(self):
        n = importador.calcular_plata(
            importador.traducir(fila(operacion="Alquiler", precio=512, pct_comision=1.504,
                                     facturado=770048, fecha_fin="2024-04-04"), AJUSTES),
            AJUSTES)
        self.assertAlmostEqual(n["facturacion"], 770.048, places=3)
        self.assertIn("separador_decimal", [a["tipo"] for a in n["avisos"]])

    def test_un_descuento_real_no_se_toca(self):
        # Fila 39: 109.000 x 3% = 3.270 pero el usuario cobro 2.772,96. Es un descuento.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=109000.0, pct_comision=0.03,
                                     facturado=2772.96, fecha_fin="2024-05-16"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 2772.96)
        self.assertIn("aritmetica_no_cierra", [a["tipo"] for a in n["avisos"]])
        self.assertNotIn("separador_decimal", [a["tipo"] for a in n["avisos"]])

    def test_un_cobro_de_mas_tampoco_se_toca(self):
        # Fila 48: cobro 3.010 donde la cuenta daba 2.680. El usuario pidio respetarlo.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=67000.0, pct_comision=0.04,
                                     facturado=3010.0, fecha_fin="2024-10-06"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 3010.0)

    def test_una_comision_absurda_no_dispara_la_correccion_por_mil(self):
        # Fila 51: la comision real es 2,625% (88.000 x 2,625% = 2.310, que es lo que dice
        # el Excel). Pero la celda guarda 26,25 en vez de 0,02625, asi que la cuenta da
        # 2.310.000 — tambien un factor 1000. El error esta en el %, NO en el facturado:
        # si "corrigieramos" el facturado destruiriamos el unico numero que estaba bien.
        n = importador.calcular_plata(
            importador.traducir(fila(precio=88000.0, pct_comision=26.25,
                                     facturado=2310.0, fecha_fin="2025-02-15"), AJUSTES),
            AJUSTES)
        self.assertEqual(n["facturacion"], 2310.0)
        self.assertIn("comision_absurda", [a["tipo"] for a in n["avisos"]])
        self.assertNotIn("separador_decimal", [a["tipo"] for a in n["avisos"]])


class TestFirmaInventada(unittest.TestCase):
    def negocio(self, **cambios):
        n = importador.calcular_plata(importador.traducir(fila(**cambios), AJUSTES), AJUSTES)
        return importador.cruzar_con_cartera(n, CARTERA_VIVA)

    def test_una_venta_dada_por_cobrada_con_la_propiedad_viva_pasa_a_en_curso(self):
        # Caso real: fila 82, dada por firmada el 20/4/2026 pero la propiedad sigue reservada.
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "en_curso")
        self.assertTrue(n["fecha_fin_estimada"])
        self.assertEqual(n["entity_id_cartera"], "prop-reducto")
        self.assertIn("firma_inventada", [a["tipo"] for a in n["avisos"]])

    def test_conserva_la_fecha_del_excel_como_referencia(self):
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["fecha_fin"], "2026-04-20")

    def test_un_alquiler_sobre_una_propiedad_hoy_en_VENTA_es_legitimo(self):
        # Se puede alquilar una propiedad y despues ponerla en venta. No es contradiccion.
        n = self.negocio(direccion="estanislao vega 3959", precio=329.0,
                         operacion="Alquiler", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertFalse(n["fecha_fin_estimada"])

    def test_una_venta_sin_propiedad_en_la_cartera_queda_cerrada(self):
        n = self.negocio(direccion="Calle que no existe 100", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertIsNone(n["entity_id_cartera"])

    def test_un_negocio_viejo_no_se_toca_aunque_la_calle_coincida(self):
        # Una venta de 2023 en la misma calle no significa que sea la misma propiedad.
        n = self.negocio(direccion="San fructuoso 1254", precio=89900.0,
                         operacion="Venta", fecha_fin="2023-05-01")
        self.assertEqual(n["estado"], "cerrado")

    def test_un_cruce_de_confianza_media_avisa_pero_no_cambia_el_estado(self):
        n = self.negocio(direccion="San fructuoso 4400", precio=20000.0,
                         operacion="Venta", fecha_fin="2026-04-20")
        self.assertEqual(n["estado"], "cerrado")
        self.assertIn("posible_cruce", [a["tipo"] for a in n["avisos"]])


class TestCamposFaltantes(unittest.TestCase):
    def revisar(self, **cambios):
        n = importador.traducir(fila(**cambios), AJUSTES)
        return [a["tipo"] for a in importador.revisar_faltantes(n)["avisos"]]

    def test_avisa_si_falta_la_fecha_de_inicio(self):
        self.assertIn("falta_fecha_inicio", self.revisar(fecha_inicio=None))

    def test_avisa_si_falta_el_boleto_en_una_venta(self):
        self.assertIn("falta_fecha_boleto", self.revisar(fecha_boleto=None))

    def test_no_pide_boleto_en_un_alquiler(self):
        self.assertNotIn("falta_fecha_boleto",
                         self.revisar(operacion="Alquiler", fecha_boleto=None))

    def test_avisa_si_falta_la_direccion(self):
        self.assertIn("falta_direccion", self.revisar(direccion=None))

    def test_avisa_si_falta_el_barrio(self):
        self.assertIn("falta_barrio", self.revisar(barrio=None))

    def test_una_ficha_completa_no_genera_avisos_de_faltantes(self):
        n = importador.traducir(fila(fecha_inicio=None, fecha_boleto=None), AJUSTES)
        n["ficha_completa"] = True
        self.assertEqual([a["tipo"] for a in importador.revisar_faltantes(n)["avisos"]], [])


class TestFechasRaras(unittest.TestCase):
    def revisar(self, **cambios):
        n = importador.traducir(fila(**cambios), AJUSTES)
        return [a["tipo"] for a in importador.revisar_fechas(n, "2026-08-17")["avisos"]]

    def test_avisa_si_la_firma_esta_en_el_futuro(self):
        # Casos reales: filas 60 y 66, con firma en noviembre y diciembre de 2026.
        self.assertIn("firma_futura", self.revisar(fecha_fin="2026-12-05"))

    def test_una_firma_futura_no_puede_estar_cobrada(self):
        # No podes haber cobrado en una fecha que todavia no llego.
        n = importador.traducir(fila(fecha_fin="2026-12-05"), AJUSTES)
        n = importador.revisar_fechas(n, "2026-08-17")
        self.assertEqual(n["estado"], "en_curso")
        self.assertTrue(n["fecha_fin_estimada"])

    def test_una_firma_pasada_queda_cerrada(self):
        n = importador.traducir(fila(fecha_fin="2026-04-20"), AJUSTES)
        n = importador.revisar_fechas(n, "2026-08-17")
        self.assertEqual(n["estado"], "cerrado")
        self.assertFalse(n["fecha_fin_estimada"])

    def test_avisa_si_la_firma_es_anterior_al_boleto(self):
        # Caso real: fila 82.
        self.assertIn("fechas_al_reves",
                      self.revisar(fecha_boleto="2026-05-05", fecha_fin="2026-04-20"))

    def test_avisa_si_el_boleto_es_anterior_al_inicio(self):
        self.assertIn("fechas_al_reves",
                      self.revisar(fecha_inicio="2026-05-05", fecha_boleto="2026-04-20"))

    def test_fechas_normales_no_avisan(self):
        self.assertEqual(self.revisar(), [])


class TestImportarTodo(unittest.TestCase):
    def test_devuelve_un_negocio_por_fila(self):
        filas = [fila(fila_excel=2), fila(fila_excel=3), fila(fila_excel=4)]
        negocios = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")
        self.assertEqual(len(negocios), 3)
        self.assertEqual([n["id"] for n in negocios], ["excel-2", "excel-3", "excel-4"])

    def test_aplica_toda_la_cadena_de_revisiones(self):
        filas = [fila(fila_excel=60, fecha_inicio=None, fecha_boleto=None,
                      fecha_fin="2026-12-05", direccion="juana de ibarburu")]
        n = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")[0]
        tipos = [a["tipo"] for a in n["avisos"]]
        self.assertIn("falta_fecha_inicio", tipos)
        self.assertIn("falta_fecha_boleto", tipos)
        self.assertIn("firma_futura", tipos)

    def test_todo_lo_que_sale_se_puede_guardar_como_json(self):
        import json
        negocios = importador.importar([fila()], AJUSTES, CARTERA_VIVA, "2026-08-17")
        json.dumps(negocios, ensure_ascii=False)

    def test_los_ids_son_unicos(self):
        filas = [fila(fila_excel=i) for i in range(2, 20)]
        negocios = importador.importar(filas, AJUSTES, CARTERA_VIVA, "2026-08-17")
        ids = [n["id"] for n in negocios]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
