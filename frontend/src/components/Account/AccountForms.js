// src/components/Account/AccountForms.js
// Moduli dell'area account (blocco W6), comuni a utenti e commercialisti.
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { authAPI, commercialistiAPI } from '../../services/api';
import Button from '../UI/Button';
import Alert from '../UI/Alert';

const API = { user: authAPI, commercialista: commercialistiAPI };

const errore = (err, predefinito) => err.response?.data?.details?.[0]?.message
  || err.response?.data?.error || predefinito;

// Cambio email: serve la password; l'indirizzo cambia solo dopo il clic sul
// link spedito al nuovo indirizzo.
export const CambioEmailForm = ({ tipo, emailAttuale }) => {
  const [inAttesa, setInAttesa] = useState('');
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ email, password }) => {
    try {
      await API[tipo].cambiaEmail(password, email.trim());
      setInAttesa(email.trim());
      reset();
    } catch (err) {
      toast.error(errore(err, 'Cambio email non riuscito'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {emailAttuale && (
        <p className="text-sm text-gray-600">Indirizzo attuale: <span className="font-medium text-gray-900 break-all">{emailAttuale}</span></p>
      )}
      {inAttesa && (
        <Alert type="info">
          Ti abbiamo scritto a <span className="break-all">{inAttesa}</span>: il cambio vale dopo il clic sul link
          (valido 24 ore). Fino ad allora resta l'indirizzo attuale.
        </Alert>
      )}
      <div>
        <label className="form-label" htmlFor={`${tipo}-nuova-email`}>Nuovo indirizzo email</label>
        <input id={`${tipo}-nuova-email`} type="email" autoComplete="email"
          className={`form-input ${errors.email ? 'border-danger-500' : ''}`}
          {...register('email', { required: 'Indirizzo richiesto' })} />
        {errors.email && <p className="form-error">{errors.email.message}</p>}
      </div>
      <div>
        <label className="form-label" htmlFor={`${tipo}-email-password`}>Password attuale</label>
        <input id={`${tipo}-email-password`} type="password" autoComplete="current-password"
          className={`form-input ${errors.password ? 'border-danger-500' : ''}`}
          {...register('password', { required: 'Serve la password per confermare' })} />
        {errors.password && <p className="form-error">{errors.password.message}</p>}
      </div>
      <Button type="submit" variant="primary" loading={isSubmitting}>Cambia email</Button>
    </form>
  );
};

// Cambio password del commercialista. (Quello dell'utente passa da AuthContext.)
export const CambioPasswordCommercialistaForm = () => {
  const { register, handleSubmit, reset, getValues, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ currentPassword, newPassword }) => {
    try {
      const r = await commercialistiAPI.changePassword({ currentPassword, newPassword });
      // Il cambio chiude tutte le sessioni: questa continua con il token nuovo.
      if (r.token) localStorage.setItem('commercialista_token', r.token);
      toast.success('Password cambiata: le altre sessioni sono state chiuse');
      reset();
    } catch (err) {
      toast.error(errore(err, 'Cambio password non riuscito'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label" htmlFor="c-password-attuale">Password attuale</label>
        <input id="c-password-attuale" type="password" autoComplete="current-password"
          className={`form-input ${errors.currentPassword ? 'border-danger-500' : ''}`}
          {...register('currentPassword', { required: 'Password attuale richiesta' })} />
        {errors.currentPassword && <p className="form-error">{errors.currentPassword.message}</p>}
      </div>
      <div>
        <label className="form-label" htmlFor="c-password-nuova">Nuova password</label>
        <input id="c-password-nuova" type="password" autoComplete="new-password"
          className={`form-input ${errors.newPassword ? 'border-danger-500' : ''}`}
          {...register('newPassword', {
            required: 'Nuova password richiesta',
            minLength: { value: 8, message: 'Almeno 8 caratteri' }
          })} />
        {errors.newPassword && <p className="form-error">{errors.newPassword.message}</p>}
      </div>
      <div>
        <label className="form-label" htmlFor="c-password-conferma">Ripeti la nuova password</label>
        <input id="c-password-conferma" type="password" autoComplete="new-password"
          className={`form-input ${errors.conferma ? 'border-danger-500' : ''}`}
          {...register('conferma', { validate: v => v === getValues('newPassword') || 'Le password non coincidono' })} />
        {errors.conferma && <p className="form-error">{errors.conferma.message}</p>}
      </div>
      <Button type="submit" variant="primary" loading={isSubmitting}>Cambia password</Button>
    </form>
  );
};

// Eliminazione dell'account dello studio. I collegamenti aperti si chiudono; chat,
// allegati e registro degli accessi restano ai clienti.
export const EliminaAccountStudioForm = ({ onEliminato }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async ({ password }) => {
    try {
      await commercialistiAPI.eliminaAccount(password);
      toast.success('Account eliminato');
      onEliminato();
    } catch (err) {
      toast.error(errore(err, 'Eliminazione non riuscita'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Alert type="warning">
        L'eliminazione e' definitiva. I collegamenti con i clienti vengono chiusi e i clienti ricevono un avviso.
        Lo storico (chat, allegati, registro degli accessi) resta ai clienti; username ed email tornano liberi.
      </Alert>
      <div>
        <label className="form-label" htmlFor="c-elimina-password">Password attuale</label>
        <input id="c-elimina-password" type="password" autoComplete="current-password"
          className={`form-input ${errors.password ? 'border-danger-500' : ''}`}
          {...register('password', { required: 'Serve la password per confermare' })} />
        {errors.password && <p className="form-error">{errors.password.message}</p>}
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" className="mt-1" {...register('conferma', { required: 'Conferma per procedere' })} />
        <span>Ho capito: l'account dello studio non si puo' recuperare.</span>
      </label>
      {errors.conferma && <p className="form-error">{errors.conferma.message}</p>}
      <Button type="submit" variant="danger" loading={isSubmitting}>Elimina account</Button>
    </form>
  );
};

// Dati dello studio. Username ed email non si cambiano da qui.
export const ProfiloStudioForm = ({ profilo, onSalvato }) => {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      ragione_sociale: profilo.ragione_sociale || '',
      partita_iva: profilo.partita_iva || '',
      telefono: profilo.telefono || ''
    }
  });

  const onSubmit = async (dati) => {
    try {
      const r = await commercialistiAPI.updateProfile(dati);
      const salvato = JSON.parse(localStorage.getItem('commercialista') || '{}');
      localStorage.setItem('commercialista', JSON.stringify({ ...salvato, ...r.commercialista }));
      toast.success('Profilo aggiornato');
      onSalvato(r.commercialista);
    } catch (err) {
      toast.error(errore(err, 'Aggiornamento non riuscito'));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className="form-label" htmlFor="p-ragione">Ragione sociale</label>
        <input id="p-ragione" type="text" className="form-input" {...register('ragione_sociale', { maxLength: 200 })} />
      </div>
      <div>
        <label className="form-label" htmlFor="p-piva">Partita IVA</label>
        <input id="p-piva" type="text" inputMode="numeric"
          className={`form-input ${errors.partita_iva ? 'border-danger-500' : ''}`}
          {...register('partita_iva', { pattern: { value: /^([0-9]{11})?$/, message: 'La partita IVA ha 11 cifre' } })} />
        {errors.partita_iva && <p className="form-error">{errors.partita_iva.message}</p>}
      </div>
      <div>
        <label className="form-label" htmlFor="p-telefono">Telefono</label>
        <input id="p-telefono" type="tel"
          className={`form-input ${errors.telefono ? 'border-danger-500' : ''}`}
          {...register('telefono', { pattern: { value: /^[0-9 +().-]{0,20}$/, message: 'Telefono non valido' } })} />
        {errors.telefono && <p className="form-error">{errors.telefono.message}</p>}
      </div>
      <Button type="submit" variant="primary" loading={isSubmitting}>Salva</Button>
    </form>
  );
};
