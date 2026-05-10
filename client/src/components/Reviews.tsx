import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Star, ThumbsUp, MessageCircle, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

interface Review {
  _id: string;
  user: {
    firstName: string;
    lastName: string;
  };
  rating: {
    overall: number;
    speed: number;
    reliability: number;
    support: number;
    value: number;
  };
  comment: string;
  type: string;
  createdAt: string;
  isAnonymous: boolean;
}

interface ReviewsProps {
  type?: 'service' | 'support' | 'billing' | 'general';
  limit?: number;
}

const Reviews: React.FC<ReviewsProps> = ({ type, limit = 10 }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, [type, page]);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

  const fetchReviews = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/feedback/public`, {
        params: {
          type,
          page,
          limit,
          minRating: 1
        }
      });

      const { data, pagination } = response.data;
      
      if (page === 1) {
        setReviews(data);
      } else {
        setReviews(prev => [...prev, ...data]);
      }

      setHasMore(page < pagination.pages);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch reviews');
    } finally {
      setLoading(false);
    }
  };

  const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
    <div className="flex space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={16}
          className={star <= rating ? 'text-yellow-400' : 'text-gray-300'}
          fill={star <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );

  const ReviewCard: React.FC<{ review: Review }> = ({ review }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-lg shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-lg">
            {review.isAnonymous || !review.user
              ? 'Anonymous User'
              : `${review.user.firstName} ${review.user.lastName}`}
          </h3>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Calendar size={14} />
            <span>{format(new Date(review.createdAt), 'MMM dd, yyyy')}</span>
          </div>
        </div>
        <StarRating rating={review.rating.overall} />
      </div>

      <p className="mt-4 text-gray-700">{review.comment}</p>

      {/* Detailed Ratings */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {Object.entries(review.rating)
          .filter(([key]) => key !== 'overall')
          .map(([key, value]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-gray-600 capitalize">
                {key}
              </span>
              <StarRating rating={value} />
            </div>
          ))}
      </div>

      {/* Review Type Badge */}
      <div className="mt-4 flex items-center space-x-2">
        <span className={`px-2 py-1 rounded-full text-xs ${
          review.type === 'service'
            ? 'bg-blue-100 text-blue-800'
            : review.type === 'support'
            ? 'bg-green-100 text-green-800'
            : review.type === 'billing'
            ? 'bg-purple-100 text-purple-800'
            : 'bg-gray-100 text-gray-800'
        }`}>
          {(review.type || 'unknown').charAt(0).toUpperCase() + (review.type || 'unknown').slice(1)}
        </span>
      </div>
    </motion.div>
  );

  if (error) {
    return (
      <div className="text-red-500 text-center py-4">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {reviews.map((review) => (
          <ReviewCard key={review._id} review={review} />
        ))}
      </div>

      {loading && (
        <div className="text-center py-4">
          Loading reviews...
        </div>
      )}

      {hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={() => setPage(prev => prev + 1)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Load More Reviews
          </button>
        </div>
      )}

      {!hasMore && reviews.length > 0 && (
        <div className="text-center text-gray-600">
          No more reviews to load
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <div className="text-center text-gray-600 py-8">
          No reviews available yet
        </div>
      )}
    </div>
  );
};

export default Reviews;