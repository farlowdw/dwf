import React, {useState} from 'react';
import {useLocation} from '@docusaurus/router';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import styles from './styles.module.css';

// This name is what Netlify will use to identify the form
const FORM_NAME = 'doc-feedback';

function encode(data) {
  return Object.keys(data)
    .map(
      (key) =>
        encodeURIComponent(key) + '=' + encodeURIComponent(data[key]),
    )
    .join('&');
}

export default function DocFeedback() {
  const location = useLocation();
  const {metadata} = useDoc(); // current doc metadata

  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'success' | 'error'

  async function handleSubmit(e) {
    e.preventDefault();
    if (!rating) return;

    setStatus('submitting');

    try {
      const res = await fetch('/', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: encode({
          'form-name': FORM_NAME,
          rating,
          comment,
          docTitle: metadata.title,
          docPath: location.pathname,
          pageUrl:
            typeof window !== 'undefined' ? window.location.href : '',
          userAgent:
            typeof navigator !== 'undefined' ? navigator.userAgent : '',
        }),
      });

      if (!res.ok) throw new Error('Network error');
      setStatus('success');
      setComment('');
    } catch (err) {
      console.error(err);
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className={styles.wrapper}>
        <p className={styles.heading}>What did you think of this doc?</p>
        <p className={styles.thankYou}>Thanks for the feedback! ❤️</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.heading}>What did you think of this doc?</p>

      <form
        name={FORM_NAME}
        method="POST"
        data-netlify="true"
        data-netlify-honeypot="bot-field"
        onSubmit={handleSubmit}
      >
        {/* These hidden fields are required for Netlify to detect the form */}
        <input type="hidden" name="form-name" value={FORM_NAME} />
        <p style={{display: 'none'}}>
          <label>
            Don’t fill this out if you’re human:
            <input name="bot-field" />
          </label>
        </p>

        <div className={styles.stars}>
          {[1, 2, 3, 4, 5].map((star) => {
            const filled = rating && rating >= star;
            return (
              <button
                key={star}
                type="button"
                className={filled ? styles.starFilled : styles.star}
                onClick={() => setRating(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
              >
                ★
              </button>
            );
          })}
        </div>

        {rating && (
          <>
            <label className={styles.label}>
              Anything specific you'd like to share?
              <textarea
                className={styles.textarea}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="What worked well? What could be better?"
                name="comment"
              />
            </label>

            <button
              type="submit"
              className={styles.submit}
              disabled={status === 'submitting'}
            >
              {status === 'submitting' ? 'Sending…' : 'Send your review'}
            </button>

            {status === 'error' && (
              <p className={styles.error}>
                Something went wrong. You can also reach out directly if
                needed.
              </p>
            )}
          </>
        )}
      </form>
    </div>
  );
}