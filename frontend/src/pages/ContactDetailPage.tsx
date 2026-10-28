import { useNavigate, useParams } from 'react-router-dom';
import { useContact } from '../api/hooks';
import { ActivityList } from '../components/ActivityList';
import { ContactForm } from '../components/ContactForm';
import { ErrorBox } from '../components/ErrorBox';
import { TagEditor } from '../components/TagEditor';

export function ContactDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data, error, isPending, refetch } = useContact(id);

  return (
    <div>
      <button onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))}>← Back to list</button>
      <h1>Contact #{id}</h1>
      {isPending && <p>Loading…</p>}
      {error && <ErrorBox error={error} onRetry={() => void refetch()} />}
      {data && (
        <>
          {/* key remounts the form when navigating to another contact */}
          <ContactForm key={data.id} contact={data} />
          <section><h2>Tags</h2><TagEditor contactId={data.id} tags={data.tags} /></section>
          <section><h2>Activity</h2><ActivityList contactId={data.id} /></section>
        </>
      )}
    </div>
  );
}
